import {buildInvoiceRequest, isApprovalDue, validateAppointment} from './domain/workflow.js';
import {randomUUID} from 'node:crypto';

export function createAppointmentApprovalRepository({db,fieldValue,Timestamp,clock=()=>new Date(),claimIdFactory=randomUUID,auditRef}) {
  const ref=id=>db.collection('appointments').doc(id);
  const audit=id=>auditRef(id);
  return Object.freeze({
    claimApproval:(id,uid)=>db.runTransaction(async transaction=>{
      const appointmentRef=ref(id);
      const snapshot=await transaction.get(appointmentRef);
      if(!snapshot.exists)return null;
      const data=snapshot.data();
      const approval=data.invoiceApproval??{};
      const now=clock().getTime();
      const leaseExpiresAt=approval.leaseExpiresAt?.toMillis?.()??0;
      if(approval.status!=='pending'&&!(approval.status==='processing'&&leaseExpiresAt<=now))return null;
      const claimId=claimIdFactory();
      transaction.update(appointmentRef,{
        'invoiceApproval.status':'processing','invoiceApproval.approvedBy':uid,
        'invoiceApproval.claimId':claimId,'invoiceApproval.claimedAt':Timestamp.fromMillis(now),
        'invoiceApproval.leaseExpiresAt':Timestamp.fromMillis(now+5*60*1000),
        'invoiceApproval.approvedAt':fieldValue.serverTimestamp(),
      });
      transaction.set(audit(id),{appointmentId:id,event:'invoice_approval_claimed',approvedBy:uid,claimId,createdAt:fieldValue.serverTimestamp()});
      return {id,...data,approvalClaimId:claimId};
    }),
    completeApproval:(id,claimId,receipt)=>db.runTransaction(async transaction=>{
      const appointmentRef=ref(id);const snapshot=await transaction.get(appointmentRef);
      if(!snapshot.exists||snapshot.data().invoiceApproval?.claimId!==claimId)throw new Error('Invoice approval claim was lost');
      transaction.update(appointmentRef,{'invoiceApproval.status':'completed','invoiceApproval.claimId':null,'invoiceApproval.leaseExpiresAt':null,'invoiceApproval.completedAt':fieldValue.serverTimestamp(),'invoiceApproval.receipt':receipt});
      transaction.set(audit(id),{appointmentId:id,event:'invoice_delivered',receipt,createdAt:fieldValue.serverTimestamp()});
    }),
    failApproval:(id,claimId,error)=>db.runTransaction(async transaction=>{
      const appointmentRef=ref(id);const snapshot=await transaction.get(appointmentRef);
      if(!snapshot.exists||snapshot.data().invoiceApproval?.claimId!==claimId)throw new Error('Invoice approval claim was lost');
      transaction.update(appointmentRef,{'invoiceApproval.status':'pending','invoiceApproval.claimId':null,'invoiceApproval.leaseExpiresAt':null,'invoiceApproval.lastError':error.message,'invoiceApproval.failedAt':fieldValue.serverTimestamp()});
      transaction.set(audit(id),{appointmentId:id,event:'invoice_delivery_failed',error:error.message,createdAt:fieldValue.serverTimestamp()});
      return true;
    }),
    quarantineApproval:(id,claimId,error)=>db.runTransaction(async transaction=>{
      const appointmentRef=ref(id);const snapshot=await transaction.get(appointmentRef);
      if(!snapshot.exists||snapshot.data().invoiceApproval?.claimId!==claimId)throw new Error('Invoice approval claim was lost');
      transaction.update(appointmentRef,{'invoiceApproval.status':'manual_review','invoiceApproval.claimId':null,'invoiceApproval.leaseExpiresAt':null,'invoiceApproval.lastErrorCode':error.code,'invoiceApproval.failedAt':fieldValue.serverTimestamp()});
      transaction.set(audit(id),{appointmentId:id,event:'invoice_delivery_manual_review',errorCode:error.code,createdAt:fieldValue.serverTimestamp()});
      return true;
    }),
  });
}

export function createIntegrationService({repository, graph, quickbooks, commerce = null,
  readFeatureFlags = () => ({digitalInvoicePilotEnabled:false,serviceQboSendEnabled:false}),
  clock = () => new Date()}) {
  return {
    async confirmAcceptedBooking(appointmentId, rawAppointment) {
      const appointment = validateAppointment(rawAppointment);
      if (appointment.status !== 'accepted') return {ignored:true};
      const flags = readFeatureFlags();
      if (flags.serviceQboSendEnabled === true && Number.isInteger(appointment.amountCents)) {
        await commerce.createServiceOrder(appointmentId, appointment);
      }
      if (!await repository.claimConfirmation(appointmentId)) return {duplicate:true};
      try {
        const receipt = await graph.sendConfirmation({
          to:appointment.customerEmail,
          customerName:appointment.customerName,
          serviceName:appointment.serviceName,
          startsAt:appointment.startsAt,
          idempotencyKey:`${appointmentId}-confirmation`,
        });
        await repository.completeConfirmation(appointmentId, receipt);
        return {sent:true};
      } catch (error) {
        await repository.failConfirmation(appointmentId, {message:error.message});
        throw error;
      }
    },

    async stageDueApprovals() {
      const now = clock();
      const appointments = await repository.listAcceptedBefore(new Date(now.getTime() + 24 * 60 * 60 * 1000));
      let staged = 0;
      for (const appointment of appointments) {
        if (!isApprovalDue(appointment, now)) continue;
        if (await repository.stageApproval(appointment.id, {dueAt:now})) staged += 1;
      }
      return {examined:appointments.length, staged};
    },

    async approveInvoice({appointmentId, auth}) {
      if (!auth?.uid || auth.token?.admin !== true) throw new Error('An authenticated administrator is required');
      const appointment = await repository.claimApproval(appointmentId, auth.uid);
      if (!appointment) return {duplicate:true};
      const approvalClaimId = appointment.approvalClaimId;
      try {
        const flags = readFeatureFlags();
        if (flags.serviceQboSendEnabled === true && Number.isInteger(appointment.amountCents)) {
          const receipt = await commerce.approveServiceInvoice({appointmentId,approvedBy:auth.uid});
          await repository.completeApproval(appointmentId, approvalClaimId, {
            approvedBy:auth.uid,invoiceId:receipt.invoiceId,invoiceNumber:receipt.documentNumber,
            qboSendAccepted:receipt.sendAccepted === true,
          });
          return {invoiceId:receipt.invoiceId,invoiceNumber:receipt.documentNumber};
        }
        const invoiceRequest = buildInvoiceRequest(appointment);
        const invoice = await quickbooks.createInvoice({
          ...invoiceRequest,
          customerName:appointment.customerName,
          customerEmail:appointment.customerEmail,
          appointmentId,
        });
        const pdf = await quickbooks.getInvoicePdf(invoice.id);
        const email = await graph.sendInvoice({
          to:appointment.customerEmail,
          customerName:appointment.customerName,
          invoiceNumber:invoice.number,
          pdf,
          idempotencyKey:`${appointmentId}-invoice-email`,
        });
        await repository.completeApproval(appointmentId, approvalClaimId, {
          approvedBy:auth.uid, invoiceId:invoice.id, invoiceNumber:invoice.number, emailAccepted:email.accepted === true,
        });
        return {invoiceId:invoice.id, invoiceNumber:invoice.number};
      } catch (error) {
        if (error?.code === 'ORDER_MANUAL_REVIEW' && repository.quarantineApproval) {
          await repository.quarantineApproval(appointmentId, approvalClaimId, {code:'invoice_send_unknown'});
        } else {
          await repository.failApproval(appointmentId, approvalClaimId, {message:error.message});
        }
        throw error;
      }
    },
  };
}
