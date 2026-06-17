// The Ballers Kingdom — Inner Game: Growth Tool data
// A human-development framework for emotional self-regulation.
// Each emotion guides: Name it -> Body -> Impulse -> Real Need ->
// Regulate Now -> Responsible Response -> Reflect -> Growth Insight.
//
// Grounded in established practice: affect labeling ("name it to tame it"),
// somatic awareness, nonviolent communication (need underneath emotion),
// and values-based action. Educational self-help — not therapy or crisis care.

window.GROWTH_DATA = {
  emotions: [
    {
      id: 'anger',
      label: 'Anger',
      glyph: '\u26A1',
      blurb: 'A boundary was crossed, or something you value is under threat.',
      shades: ['Frustrated', 'Irritated', 'Resentful', 'Betrayed', 'Disrespected', 'Defensive'],
      body: 'Heat in the chest, jaw, or hands. A clenched, forward-leaning energy.',
      impulse: {
        title: 'The impulse',
        text: 'To attack, blame, win the argument, or fire off the message right now — to make the other person feel what you feel.',
        why: 'Anger is fast and feels powerful, but acting on it usually trades a long-term relationship for a short-term release. The words can\u2019t be unsaid.'
      },
      need: {
        title: 'The real need underneath',
        text: 'Respect, fairness, or a boundary that gets honored. Anger almost always points at a value that matters to you being stepped on.',
        ask: 'What boundary or value of mine just got crossed?'
      },
      regulate: {
        title: 'Regulate first',
        practice: 'Box breathing',
        steps: [
          'Breathe in for 4 counts.',
          'Hold for 4 counts.',
          'Breathe out slowly for 6 counts.',
          'Repeat 4 times. Longer exhales tell your nervous system the threat is over.'
        ],
        note: 'If you\u2019re above a 7/10, do not respond yet. Give it 20 minutes. Anger\u2019s chemical spike fades \u2014 your judgment returns.'
      },
      response: {
        title: 'The responsible response',
        text: 'Name the behavior, not the person. State the impact, then the ask.',
        script: '\u201CWhen [specific thing happened], I felt disrespected, because [why it mattered]. Going forward, I need [clear request].\u201D',
        actions: [
          'Address the behavior, not the worth of the person.',
          'Ask for what you want instead of only naming what you don\u2019t.',
          'If they\u2019re not safe to talk to, write it out and don\u2019t send it \u2014 the goal is to discharge, not to win.'
        ]
      },
      reflect: 'What was the boundary that got crossed \u2014 and have I clearly told this person where that line is?',
      insight: 'Anger handled well becomes assertiveness: the skill of protecting what matters without burning down what you\u2019re protecting it for.'
    },
    {
      id: 'loneliness',
      label: 'Loneliness',
      glyph: '\u25CB',
      blurb: 'A gap between the connection you have and the connection you need.',
      shades: ['Isolated', 'Unseen', 'Left out', 'Disconnected', 'Homesick', 'Misunderstood'],
      body: 'A hollow or heavy feeling in the chest. Sometimes restlessness, sometimes numbness.',
      impulse: {
        title: 'The impulse',
        text: 'To withdraw further, doom-scroll, or numb out \u2014 or to grab any connection, even one that isn\u2019t good for you.',
        why: 'Isolation feels safe but deepens the gap. Numbing skips the signal. Grabbing the wrong connection leaves you lonelier afterward.'
      },
      need: {
        title: 'The real need underneath',
        text: 'To be seen and to belong \u2014 genuine contact with someone who knows you, not just to be around people.',
        ask: 'Who, specifically, would I want to be known by right now?'
      },
      regulate: {
        title: 'Regulate first',
        practice: 'Reach, don\u2019t broadcast',
        steps: [
          'Put the phone face-down for 2 minutes and feel the feeling without fixing it.',
          'Name one person who has felt safe before \u2014 not the most impressive one, the safest one.',
          'Lower the bar: a one-line text counts. Connection, not a performance.'
        ],
        note: 'Loneliness lies. It tells you that you\u2019re a burden and that no one wants to hear from you. That\u2019s the feeling talking, not the truth.'
      },
      response: {
        title: 'The responsible response',
        text: 'Make one real, low-stakes bid for connection \u2014 specific and honest.',
        script: '\u201CHey \u2014 thinking of you. No agenda, I just wanted to reach out. How are you really doing?\u201D',
        actions: [
          'Send one message to one safe person today.',
          'Choose presence over numbers \u2014 one real conversation beats a feed full of people.',
          'Schedule recurring contact so connection isn\u2019t left to a lonely-night decision.'
        ]
      },
      reflect: 'When did I last feel genuinely seen \u2014 and what was different about that moment?',
      insight: 'Loneliness handled well becomes the courage to initiate \u2014 to build the belonging you want instead of waiting to be chosen.'
    },
    {
      id: 'anxiety',
      label: 'Anxiety',
      glyph: '\u25B3',
      blurb: 'Your mind is trying to protect you from a future that hasn\u2019t happened yet.',
      shades: ['Worried', 'On edge', 'Dreading', 'Overthinking', 'Panicky', 'Tense'],
      body: 'Tight chest, fast or shallow breath, racing thoughts, a knot in the stomach.',
      impulse: {
        title: 'The impulse',
        text: 'To avoid the thing entirely, or to spiral \u2014 researching, rehearsing worst cases, seeking reassurance on a loop.',
        why: 'Avoidance shrinks your world and teaches the brain the thing really was dangerous. Spiraling feels productive but just rehearses the fear.'
      },
      need: {
        title: 'The real need underneath',
        text: 'Safety and a sense of control \u2014 usually over something specific and often something you can actually influence in part.',
        ask: 'What exactly am I afraid will happen \u2014 and what part of it is actually in my control?'
      },
      regulate: {
        title: 'Regulate first',
        practice: '5-4-3-2-1 grounding',
        steps: [
          'Name 5 things you can see.',
          'Name 4 things you can feel.',
          'Name 3 things you can hear.',
          'Name 2 things you can smell.',
          'Name 1 thing you can taste. This pulls you out of the future and back into the now.'
        ],
        note: 'Anxiety lives in the future. Your senses only exist in the present \u2014 that\u2019s why grounding works.'
      },
      response: {
        title: 'The responsible response',
        text: 'Separate what you control from what you don\u2019t, then take one small action on the controllable part.',
        script: 'Write two columns: \u201CIn my control\u201D and \u201CNot in my control.\u201D Pick one item from the first column and do the smallest next step.',
        actions: [
          'Shrink the task until the first step feels almost too easy \u2014 then do that step.',
          'Set a 10-minute \u201Cworry window\u201D instead of worrying all day.',
          'Trade reassurance-seeking for one concrete action \u2014 action lowers anxiety; reassurance feeds it.'
        ]
      },
      reflect: 'What\u2019s the smallest next step I could take \u2014 and what story is my anxiety telling that may not be true?',
      insight: 'Anxiety handled well becomes preparation and courage \u2014 the ability to move toward what matters while afraid.'
    },
    {
      id: 'sadness',
      label: 'Sadness',
      glyph: '\u25BD',
      blurb: 'You\u2019ve lost something that mattered, or are letting something go.',
      shades: ['Down', 'Grieving', 'Heavy', 'Disappointed', 'Empty', 'Tearful'],
      body: 'Heaviness in the chest or limbs, low energy, a lump in the throat, slowed movement.',
      impulse: {
        title: 'The impulse',
        text: 'To force yourself to \u201Cget over it,\u201D push through, or bury it under busyness and distraction.',
        why: 'Sadness suppressed doesn\u2019t leave \u2014 it goes underground and resurfaces as numbness, irritability, or burnout. It needs to be felt to move through.'
      },
      need: {
        title: 'The real need underneath',
        text: 'To grieve and to be comforted \u2014 to honor that the thing you lost actually mattered to you.',
        ask: 'What am I actually mourning here, and what did it mean to me?'
      },
      regulate: {
        title: 'Regulate first',
        practice: 'Let it move',
        steps: [
          'Give yourself permission to feel it \u2014 set a timer if that helps you trust it won\u2019t swallow the whole day.',
          'Soften: warm drink, blanket, music that matches the mood rather than fighting it.',
          'Let tears come if they\u2019re there. Crying is the body completing the stress cycle, not a failure.'
        ],
        note: 'Sadness is slow on purpose. It\u2019s asking you to stop and honor a loss \u2014 not to be fixed or rushed.'
      },
      response: {
        title: 'The responsible response',
        text: 'Honor the loss, then gently re-engage \u2014 comfort first, then one small act of care for yourself.',
        script: '\u201CThis mattered to me, and it\u2019s okay that I\u2019m sad. I\u2019m going to be gentle with myself today and do one small kind thing.\u201D',
        actions: [
          'Tell one trusted person \u2014 sadness shared is sadness halved.',
          'Do one small, restorative act: a walk, sunlight, a meal, rest.',
          'Watch for the line between sadness that moves and a low mood that lingers for weeks \u2014 if it persists, reach out for support.'
        ]
      },
      reflect: 'What did this loss mean to me \u2014 and what would comfort, not distraction, look like right now?',
      insight: 'Sadness felt fully becomes acceptance and depth \u2014 it\u2019s the emotion that lets you love things knowing they can end.'
    },
    {
      id: 'shame',
      label: 'Shame',
      glyph: '\u25C7',
      blurb: 'The painful belief that something is wrong with you \u2014 not just your action.',
      shades: ['Not enough', 'Embarrassed', 'Exposed', 'Worthless', 'Like a failure', 'Self-critical'],
      body: 'A sinking, shrinking sensation. Heat in the face, the urge to hide or disappear.',
      impulse: {
        title: 'The impulse',
        text: 'To hide, attack yourself, perform perfection, or lash out at someone else to deflect the spotlight.',
        why: 'Shame thrives in secrecy and silence. Hiding it grows it; self-attack reinforces the lie that you are the problem.'
      },
      need: {
        title: 'The real need underneath',
        text: 'To be accepted as you are \u2014 worthy of belonging even when you\u2019re imperfect or got something wrong.',
        ask: 'Am I confusing \u201CI did something bad\u201D with \u201CI am bad\u201D?'
      },
      regulate: {
        title: 'Regulate first',
        practice: 'Separate guilt from shame',
        steps: [
          'Name it: \u201CThis is shame, and shame lies.\u201D',
          'Reframe: guilt says \u201CI did something bad\u201D (useful, fixable). Shame says \u201CI am bad\u201D (false, paralyzing).',
          'Speak to yourself as you would to a good friend who made the same mistake.'
        ],
        note: 'Shame cannot survive being spoken to someone who responds with empathy. Telling a safe person is the antidote.'
      },
      response: {
        title: 'The responsible response',
        text: 'Move from \u201CI am bad\u201D to \u201CI did something I can repair,\u201D then take a repair step if one exists.',
        script: '\u201CI made a mistake \u2014 that doesn\u2019t make me a failure. Here\u2019s what I can do to make it right: [repair]. And here\u2019s what I\u2019m learning.\u201D',
        actions: [
          'Tell one safe, empathetic person \u2014 the cure for shame is empathy, not isolation.',
          'If you harmed someone, make a genuine repair. If you only harmed yourself, practice self-forgiveness.',
          'Trade self-criticism for self-compassion \u2014 it\u2019s more motivating and more honest.'
        ]
      },
      reflect: 'Whose voice does my inner critic sound like \u2014 and would I ever say those words to someone I love?',
      insight: 'Shame met with self-compassion becomes humility and resilience \u2014 you can own a mistake without being crushed by it.'
    },
    {
      id: 'overwhelmed',
      label: 'Overwhelmed',
      glyph: '\u2261',
      blurb: 'Too many demands, too few resources \u2014 your system is at capacity.',
      shades: ['Buried', 'Scattered', 'Paralyzed', 'Stretched thin', 'Frozen', 'Maxed out'],
      body: 'A buzzing, scattered energy or a frozen blank. Tight shoulders, shallow breath, can\u2019t think straight.',
      impulse: {
        title: 'The impulse',
        text: 'To freeze and do nothing, or to frantically multitask everything at once \u2014 both of which make the pile feel bigger.',
        why: 'Freezing lets the load grow; frantic multitasking fragments your attention so nothing actually finishes. Either way the overwhelm wins.'
      },
      need: {
        title: 'The real need underneath',
        text: 'Clarity and capacity \u2014 to know what actually matters and to have the space and support to do it.',
        ask: 'If only one thing got done today, which one would matter most?'
      },
      regulate: {
        title: 'Regulate first',
        practice: 'Empty the bucket',
        steps: [
          'Physiological sigh: two short inhales through the nose, one long exhale through the mouth. Repeat 3x.',
          'Brain-dump every open loop onto one list \u2014 get it out of your head and onto paper.',
          'Circle the ONE thing that matters most. Everything else can wait or go.'
        ],
        note: 'Overwhelm isn\u2019t a sign you\u2019re weak \u2014 it\u2019s a sign your load is bigger than your current resources. The fix is to shrink the load or grow the support, not to try harder.'
      },
      response: {
        title: 'The responsible response',
        text: 'Pick one thing, protect a block of time for it, and renegotiate or drop the rest.',
        script: '\u201CI can\u2019t do all of this at once and do it well. The priority is [one thing]. For the rest, I need to [delay / delegate / drop / ask for help].\u201D',
        actions: [
          'Do one thing fully before starting the next \u2014 single-task on purpose.',
          'Practice the honest no: every yes to one thing is a no to another.',
          'Ask for help or hand something off \u2014 capacity is a resource you can borrow.'
        ]
      },
      reflect: 'What can I take off my plate this week \u2014 by delaying, delegating, or simply deciding it doesn\u2019t matter?',
      insight: 'Overwhelm handled well becomes prioritization and boundaries \u2014 the skill of doing the few things that matter instead of all the things that don\u2019t.'
    }
  ],

  // Crisis safety net — shown discreetly throughout the tool.
  crisis: {
    text: 'This is a self-reflection tool for everyday growth \u2014 not a substitute for professional care. If you\u2019re in crisis or thinking about harming yourself, please reach out now.',
    lines: [
      { label: 'Call or text 988', detail: 'Suicide & Crisis Lifeline (US) \u2014 24/7', href: 'tel:988' },
      { label: 'Text HOME to 741741', detail: 'Crisis Text Line (US)', href: 'sms:741741' },
      { label: 'Call 911', detail: 'If you or someone else is in immediate danger', href: 'tel:911' }
    ]
  }
};
