// The Ballers Kingdom — Your Game
// Original contribution-role framework. Roles describe how a person tends to
// serve and steward; they are not spiritual offices, diagnoses, or identities.

window.YOUR_GAME_DATA = {
  guardrail: 'This assessment is a mirror, not a verdict. Your identity is received in Christ, not earned through performance or assigned by a score.',
  purposeNote: 'A questionnaire cannot tell you God\'s private will. It can help you notice gifts, burdens, fruit, responsibilities, and the next faithful step already in front of you.',
  scale: [
    { value: 1, label: 'Rarely true' },
    { value: 2, label: 'Sometimes' },
    { value: 3, label: 'Often' },
    { value: 4, label: 'Usually' },
    { value: 5, label: 'Deeply true' }
  ],
  roles: [
    {
      id: 'playmaker', name: 'The Playmaker', mark: 'P', verb: 'Equip',
      essence: 'You see people, connect strengths, and create the conditions for others to contribute.',
      contribution: 'You make the whole field better by noticing what others carry and helping it come alive.',
      pressure: 'Encouragement can become approval-seeking, over-functioning, or avoiding a necessary hard truth.',
      practice: 'Help without taking over. Tell the truth in love, then let another person carry their responsibility.',
      scripture: 'Romans 12:6–8',
      identity: 'I do not need to be needed. I am free to equip people faithfully and release the outcome.',
      innerPrompt: 'Am I serving this person—or trying to secure my place by being indispensable?'
    },
    {
      id: 'builder', name: 'The Builder', mark: 'B', verb: 'Establish',
      essence: 'You turn vision into structure, bring order to complexity, and make useful things endure.',
      contribution: 'You translate possibility into plans, systems, standards, and finished work.',
      pressure: 'Stewardship can become control, impatience, perfectionism, or believing everything depends on you.',
      practice: 'Build the next faithful piece. Leave room for people, limits, rest, and God’s timing.',
      scripture: '1 Corinthians 3:9–11',
      identity: 'I am a steward, not the foundation. I build carefully and trust God with what I cannot carry.',
      innerPrompt: 'What am I trying to control because I am afraid the work will fail without me?'
    },
    {
      id: 'guardian', name: 'The Guardian', mark: 'G', verb: 'Protect',
      essence: 'You notice what is vulnerable, hold the line on what matters, and create trustworthy ground.',
      contribution: 'You protect people, truth, quality, boundaries, and the commitments others may overlook.',
      pressure: 'Protection can become suspicion, rigidity, withdrawal, or defending comfort instead of conviction.',
      practice: 'Name the value at stake, protect it proportionately, and stay open to wise correction.',
      scripture: 'Proverbs 4:23–27',
      identity: 'I can be watchful without being ruled by fear. I protect what matters with courage and wisdom.',
      innerPrompt: 'Is this a real boundary to protect, or is fear making every change feel unsafe?'
    },
    {
      id: 'pathfinder', name: 'The Pathfinder', mark: 'F', verb: 'Explore',
      essence: 'You see possibility beyond familiar borders and move toward what others have not yet tried.',
      contribution: 'You discover routes, ask fresh questions, and help people move when the old map no longer fits.',
      pressure: 'Courage can become restlessness, novelty-chasing, unfinished work, or resistance to accountability.',
      practice: 'Explore with a compass. Test the next step, finish what the season requires, and invite counsel.',
      scripture: 'Hebrews 11:8–10',
      identity: 'I do not need constant motion to prove faith. I can move courageously and remain rooted.',
      innerPrompt: 'Am I following a faithful next step—or escaping the discipline of staying and finishing?'
    },
    {
      id: 'catalyst', name: 'The Catalyst', mark: 'C', verb: 'Activate',
      essence: 'You awaken courage, name the moment, and turn hesitation into meaningful movement.',
      contribution: 'You bring conviction and momentum when people know what matters but have not acted.',
      pressure: 'Urgency can become intensity, domination, impulsiveness, or measuring worth by visible impact.',
      practice: 'Move at the speed of obedience, not adrenaline. Create momentum that other people can sustain.',
      scripture: 'Hebrews 10:24–25',
      identity: 'I am not responsible for manufacturing every outcome. I can act boldly without forcing people or timing.',
      innerPrompt: 'Is this urgency coming from conviction—or from anxiety that nothing matters unless it happens now?'
    }
  ],
  rounds: [
    {
      name: 'How you enter the field', eyebrow: 'Wiring',
      prompt: 'Answer for who you consistently are—not who you think sounds impressive.',
      statements: [
        { role: 'playmaker', text: 'I quickly notice what someone else does well and how it could help the whole team.' },
        { role: 'builder', text: 'When an idea matters, I naturally begin turning it into steps, structure, or a working system.' },
        { role: 'guardian', text: 'I notice risks, crossed boundaries, or weakening standards before most people do.' },
        { role: 'pathfinder', text: 'I become energized when there is no obvious map and a new route needs to be discovered.' },
        { role: 'catalyst', text: 'I can feel when a group needs courage, clarity, or a decisive first move.' }
      ]
    },
    {
      name: 'How you create value', eyebrow: 'Contribution',
      prompt: 'Think across sport, work, family, church, and community—not only your job title.',
      statements: [
        { role: 'builder', text: 'People rely on me to make plans practical and carry important work through to completion.' },
        { role: 'guardian', text: 'People trust me to remember the commitment, protect the standard, or say when something is not right.' },
        { role: 'pathfinder', text: 'I help people see options they had not considered and move beyond familiar limits.' },
        { role: 'catalyst', text: 'My conviction or energy often helps people stop circling and begin acting.' },
        { role: 'playmaker', text: 'I create connections that help people feel seen, useful, and stronger together.' }
      ]
    },
    {
      name: 'What you protect under pressure', eyebrow: 'Inner Game',
      prompt: 'Answer honestly. A strength under strain often reveals both your gift and your growth edge.',
      statements: [
        { role: 'guardian', text: 'Under stress, I become highly alert to what could go wrong or who may get hurt.' },
        { role: 'pathfinder', text: 'When boxed in, my first instinct is to find a different route, environment, or possibility.' },
        { role: 'catalyst', text: 'When progress stalls, I feel an urge to push harder, speak more directly, or take charge.' },
        { role: 'playmaker', text: 'When relationships strain, I feel responsible for restoring connection or helping everyone function.' },
        { role: 'builder', text: 'When outcomes feel uncertain, I add plans, effort, detail, or control.' }
      ]
    },
    {
      name: 'What faithful growth looks like', eyebrow: 'Stewardship',
      prompt: 'Choose what describes the kind of responsibility you repeatedly feel drawn to carry.',
      statements: [
        { role: 'pathfinder', text: 'I want to open responsible paths for people who cannot see a way forward yet.' },
        { role: 'catalyst', text: 'I want to call people out of hesitation and into courageous, meaningful action.' },
        { role: 'playmaker', text: 'I want to develop people and help their gifts serve something larger than themselves.' },
        { role: 'builder', text: 'I want to establish work, systems, or institutions that remain useful beyond my direct involvement.' },
        { role: 'guardian', text: 'I want to preserve what is true, valuable, safe, and worth passing forward.' }
      ]
    }
  ],
  arenas: ['Athletics', 'Business / entrepreneurship', 'Leadership', 'Career / craft', 'Family / relationships', 'Community / ministry', 'A season of transition'],
  seasons: [
    { id: 'prepare', name: 'Prepare', line: 'Build roots, skill, wisdom, and readiness before the next opening.' },
    { id: 'build', name: 'Build', line: 'Turn the assignment in front of you into faithful, durable work.' },
    { id: 'lead', name: 'Lead', line: 'Carry responsibility for people, direction, culture, or a consequential decision.' },
    { id: 'transition', name: 'Transition', line: 'Release an old identity or assignment and discern the next faithful season.' },
    { id: 'restore', name: 'Restore', line: 'Repair what has been neglected, wounded, disordered, or depleted.' },
    { id: 'multiply', name: 'Multiply', line: 'Equip others, transfer wisdom, and make the work less dependent on you.' }
  ],
  dailyScripture: [
    { ref: 'Ephesians 2:10', truth: 'You are God’s workmanship, formed for good work prepared for faithful participation.', question: 'What good work is already in front of me today?' },
    { ref: 'Colossians 3:23–24', truth: 'Wholehearted work is offered to the Lord before it is evaluated by people.', question: 'Where am I tempted to perform for approval instead of serving faithfully?' },
    { ref: 'Micah 6:8', truth: 'Faithful living joins justice, mercy, and humble fellowship with God.', question: 'What would justice, mercy, and humility require in today’s decisions?' },
    { ref: 'Proverbs 4:23–27', truth: 'Guard the inner life, speak truthfully, and keep your path deliberate.', question: 'What needs a boundary so I can walk straight today?' },
    { ref: 'James 1:5', truth: 'When wisdom is lacking, ask God—honestly and expectantly.', question: 'What decision needs wisdom more than speed?' },
    { ref: 'Galatians 6:4–5', truth: 'Examine your own work faithfully without building identity through comparison.', question: 'What is mine to carry today, and what is not?' },
    { ref: 'Luke 16:10', truth: 'Faithfulness in what appears small forms the person trusted with more.', question: 'What small responsibility deserves my full integrity today?' }
  ]
};
