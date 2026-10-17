/**
 * No runtime registration or real provider activation lives here.
 * Durable injected repository contract:
 * getOrder(id): trusted immutable order snapshot.
 * reserveDispatch(id, expected): ATOMIC compare-and-set from awaiting_payment;
 *   compare realm/invoice/customer/currency/total and version when present, recheck
 *   cancellation/refund holds, persist dispatch_reserved + stable dispatchKey
 *   BEFORE returning the immutable supplierPayload; return null on conflict.
 * hold(id, reason, expected): ATOMIC conditional write, return true only if applied.
 *   Before reserve require awaiting_payment + exact snapshot version and immutable
 *   realm/invoice/customer/currency/total; never overwrite reserved/dispatched.
 *   After reserve require dispatch_reserved and matching dispatchKey.
 *   Version tokens must change on every mutation; false means stale worker.
 * completeDispatch(id,key,receipt): atomically persist receipt for that key.
 * Reservations are never automatically reclaimed or retried, even after crashes.
 * accounting.getInvoice must read authoritative QBO state, not webhook assertions.
 * accounting.verifyPayment(order) independently verifies linked positive QBO payments
 * and company/realm identity; it must reject credits/write-offs/reversals as payment.
 * supplier.submitOrder is an explicit injected bridge to a provider createOrder API;
 * normalize only confirmed acceptance to {status:"accepted",supplierOrderId}.
 * Runtime prerequisites still include a verified server quote provenance check and
 * explicit address bridge from normalized address fields to supplier shipping fields.
 * This domain module does not establish either integration or authorize fulfillment.
 */
export function createApparelDispatchService({repo,accounting,supplier}) {
  for(const name of ['getOrder','reserveDispatch','hold','completeDispatch'])if(typeof repo?.[name]!=='function')throw new Error(`Repository ${name} required`);
  if(typeof accounting?.getInvoice!=='function'||typeof supplier?.submitOrder!=='function')throw new Error('Provider adapters required');
  return {
    async dispatch(orderId){
      if(typeof orderId!=='string'||!orderId.trim()||orderId.length>200)throw new Error('Invalid order ID');
      const order=await repo.getOrder(orderId);
      if(!order)return {status:'not_found'};
      if(order.status!=='awaiting_payment')return {status:order.status==='dispatched'?'dispatched':'held_or_reserved'};
      const snapshot={status:'awaiting_payment',version:order.version,realmId:order.realmId,invoiceId:order.invoiceId,customerId:order.customerId,currency:order.currency,totalCents:order.totalCents};
      async function hold(id,reason,key){
        const expected=key?{status:'dispatch_reserved',dispatchKey:key}:snapshot;
        const applied=await repo.hold(id,reason,expected);
        return applied===true?{status:'hold',reason}:{status:'held_or_reserved'};
      }
      if(order.cancelled||order.refundPending)return hold(orderId,'cancellation_or_refund');
      const validMoney=Number.isSafeInteger(order.totalCents)&&order.totalCents>0;
      if(order.id!==orderId||typeof order.realmId!=='string'||!order.realmId.trim()||!order.invoiceId||!order.customerId||order.currency!=='USD'||!validMoney)return hold(orderId,'invalid_order_record');
      let invoice;
      try {invoice=await accounting.getInvoice(order.invoiceId);}catch{return hold(orderId,'payment_verification_unknown');}
      if(!invoice||invoice.id!==order.invoiceId||invoice.customerId!==order.customerId||invoice.currency!==order.currency||!Number.isSafeInteger(invoice.totalCents)||invoice.totalCents!==order.totalCents||invoice.balanceCents!==0)return hold(orderId,'payment_mismatch_or_unpaid');
      let payment;
      try {payment=await accounting.verifyPayment(order);}catch{return hold(orderId,'payment_verification_unknown');}
      const linked=payment?.linkedPaymentIds;
      if(payment?.verified!==true||payment.realmId!==order.realmId||payment.merchantName!=='The Ballers Kingdom'||payment.invoiceId!==order.invoiceId||payment.customerId!==order.customerId||payment.currency!==order.currency||payment.totalCents!==order.totalCents||payment.reversed!==false||!Array.isArray(linked)||!linked.length||linked.some(id=>typeof id!=='string'||!id.trim())||new Set(linked).size!==linked.length)return hold(orderId,'payment_proof_mismatch');
      const expected={realmId:order.realmId,invoiceId:order.invoiceId,customerId:order.customerId,currency:order.currency,totalCents:order.totalCents,version:order.version,payment:{...payment},invoice:{...invoice}};
      const reservation=await repo.reserveDispatch(orderId,expected);
      if(!reservation)return {status:'held_or_reserved'};
      const key=reservation.dispatchKey;
      if(typeof key!=='string'||!key||reservation.cancelled||reservation.refundPending||!reservation.supplierPayload)return hold(orderId,'invalid_dispatch_reservation',key);
      try {
        // A stable key allows reconciliation, not blind retry after an unknown result.
        const receipt=await supplier.submitOrder(reservation.supplierPayload,{idempotencyKey:key});
        if(!receipt||receipt.status!=='accepted'||typeof receipt.supplierOrderId!=='string'||!receipt.supplierOrderId.trim())return hold(orderId,'supplier_result_unknown',key);
        await repo.completeDispatch(orderId,key,receipt);
        return {status:'dispatched',supplierOrderId:receipt.supplierOrderId};
      }catch{return hold(orderId,'supplier_result_unknown',key);}
    },
  };
}
