// Heuristic, deterministic message classification. NO LLM, no generation —
// pure pattern matching, so it can run unattended on the mini and its output is
// auditable. Returns one primary tag plus boolean signals.
//
// Tags: 'question' | 'bug' | 'feedback' | 'help' | 'social'
//   - question: asking something (ends in ?, interrogatives)
//   - bug:      reporting something broken / a crash / a glitch
//   - feedback: opinion / suggestion / reaction to the game
//   - help:     answering or assisting others (reply with explanatory tone)
//   - social:   greetings, chatter, reactions — the default

const BUG_RE = /\b(bug|crash(?:ed|es|ing)?|broke(?:n)?|glitch|freeze|frozen|stuck|softlock|soft-lock|error|exception|doesn'?t work|not working|won'?t (?:load|start|run)|black screen|nan|undefined)\b/i;
const FEEDBACK_RE = /\b(i think|imo|suggest(?:ion)?|feedback|would be (?:cool|nice|great)|wish|should (?:be|have|add)|feels? (?:too|really|kinda)|love(?:d)? the|hate(?:d)? the|too (?:hard|easy|fast|slow|punishing)|balanc(?:e|ing)|op\b|overpowered|underpowered|nerf|buff)\b/i;
const QUESTION_RE = /\?\s*$|\b(how (?:do|can|to)|what(?:'s| is| are)|why (?:does|is|do)|where (?:is|do|can)|when (?:does|is|do)|which|anyone know|is there (?:a|any)|can (?:i|you|we))\b/i;
const HELP_RE = /\b(you (?:can|could|should|need to)|try (?:pressing|using|the)|it'?s because|that'?s because|the (?:trick|key) is|here'?s how|just (?:press|hit|use)|press \S+ to|to (?:do|fix) (?:that|this))\b/i;

export function classifyMessage(content) {
  const text = (content ?? '').trim();
  const signals = {
    hasLink: /\bhttps?:\/\/\S+/i.test(text),
    isQuestion: QUESTION_RE.test(text),
    mentionsBug: BUG_RE.test(text),
  };

  let tag = 'social';
  // Priority order: bug reports and questions are the highest-value signals for
  // the community-heartbeat job, so they win ties.
  if (signals.mentionsBug) tag = 'bug';
  else if (signals.isQuestion) tag = 'question';
  else if (FEEDBACK_RE.test(text)) tag = 'feedback';
  else if (HELP_RE.test(text)) tag = 'help';

  return { tag, ...signals };
}
