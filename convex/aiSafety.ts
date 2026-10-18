export const justiceCareerTitles = new Set(["Criminal Lawyer", "Forensic Scientist", "Police Officer", "Cyber Crime Investigator"]);

const normaliseSafetyText = (value: string) => value.normalize("NFKC").toLowerCase()
  .replace(/[01!|]/g, char => ({ "0": "o", "1": "i", "!": "i", "|": "i" }[char] ?? char))
  .replace(/[3]/g, "e").replace(/[4@]/g, "a").replace(/[5$]/g, "s").replace(/[7]/g, "t")
  .replace(/[^\u0900-\u097f\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();

const codeRules: Array<[string, RegExp]> = [
  ["self-harm", /\b(?:self[- ]?harm|suicid(?:e|al)|kill myself|hurt myself|cut myself|self injury)\b/i],
  ["violence", /\b(?:killer|murder(?:er)?|assassinat(?:e|ion)|how to kill|make a bomb|kill someone|shoot someone|attack someone)\b/i],
  ["crime", /\b(?:how to (?:commit|get away with) (?:a )?(?:crime|robbery|fraud|theft|scam)|(?:commit|plan|carry out) (?:a )?(?:crime|robbery|fraud|theft|scam)|(?:rob|steal|defraud|scam|break into) (?:a |the |someone'?s )?(?:bank|store|account|home|house|car|person|people|business|system|building)|make money (?:by|through) (?:fraud|scamming|stealing))\b/i],
  ["account-hacking", /\b(?:hack(?:er|ing)? (?:into )?(?:accounts?|someone'?s account)|hack (?:my |a |someone'?s )?(?:friend'?s )?(?:instagram|account|password|login)|steal passwords?|bypass (?:a )?login)\b/i],
  ["drugs", /\b(?:cocaine|heroin|meth(?:amphetamine)?|fentanyl|illegal drugs?|drug dealing|narcotics?|get high|drug abuse|(?:buy|use|sell|make|obtain|smuggle) (?:illegal )?drugs?|nasha|nashe|ganja|charas|sharab)\b/i],
  ["weapons", /\b(?:guns?|firearms?|weapons?|explosives?|bandook|pistol|knife|bomb)\b/i],
  ["gambling", /\b(?:gambling|sports betting|betting|casino|poker for money|juaa|juwa|satta)\b/i],
  ["adult-content", /\b(?:porn(?:ography)?|explicit sexual|adult content|sex work|nudes|sexual content)\b/i],
  ["hate-abuse", /\b(?:hate speech|racial slur|harass|bully|abuse|threaten|attack (?:a |the )?(?:group|person)|nafrat|gaali)\b/i],
  ["extremism", /\b(?:terroris(?:m|t)|extremis(?:m|t)|recruit for (?:isis|terrorism)|make propaganda|aatank)\b/i],
  ["cheating", /\b(?:cheat(?:ing)? (?:on|in) (?:a )?(?:test|exam|school)|plagiar(?:ize|ism)|fake (?:a )?(?:signature|document|receipt))\b/i],
];

const normalizedRules: Array<[string, RegExp]> = [
  ["self-harm", /\b(?:self\s*harm|suicide|kill\s*myself|hurt\s*myself|cut\s*myself|aatmahatya|self\s*injury)\b/],
  ["violence", /\b(?:violence|violent|killer|kiler|killar|kill|murder|muder|murdr|maar|marna|marunga|hatya|assassinat|shoot someone|attack someone)\b/],
  ["crime", /\b(?:chori|chor|lootna|thagna|dhokha|steal|cheatpeople|commit fraud|commit theft|commit robbery|run a scam|scam (?:people|someone|users|accounts)|defraud|steal from)\b/],
  ["account-hacking", /\b(?:hack|hacking)\b.{0,45}\b(?:account|instagram|password|login)\b|\b(?:account|instagram|password|login)\b.{0,45}\b(?:hack|hacking)\b|\bsteal passwords?\b|\bbypass login\b/],
  ["drugs", /\b(?:cocaine|heroin|meth|fentanyl|narcotics|nasha|nashe|ganja|charas|sharab|alcohol|smoking|cigarette|vape|(?:use|buy|sell|make|obtain) drugs?)\b/],
  ["weapons", /\b(?:gun|guns|weapon|weapons|firearms|bandook|pistol|bomb|explosive|knife)\b/],
  ["gambling", /\b(?:gambling|betting|bet|juaa|juwa|satta|casino|poker for money)\b/],
  ["adult-content", /\b(?:porn|pornography|sex|sexual|adult content|nudes|ashleel)\b/],
  ["hate-abuse", /\b(?:hate speech|abuse|bully|harass|slur|nafrat|gaali|threaten)\b/],
  ["extremism", /\b(?:terrorism|terrorist|extremism|extremist|aatank|jihad)\b/],
  ["cheating", /\b(?:cheating|cheat|plagiarism|nakal|exam cheat|fake signature|fake document)\b/],
];

const compactExactRules: Array<[string, RegExp]> = [
  ["self-harm", /^(?:selfharm|suicide|killmyself|hurtmyself|cutmyself|aatmahatya)$/],
  ["violence", /^(?:killer|kiler|killar|murder|muder|murdr|assassinate|maar|marna|marunga|hatya)$/],
  ["crime", /^(?:chori|chor|theft|robbery|fraud|scam|scammer|scams|juaa|juwa|satta)$/],
  ["account-hacking", /^(?:hack|hacking|h4ck|stealpasswords|bypasslogin)$/],
  ["drugs", /^(?:drug|drugs|cocaine|heroin|meth|fentanyl|nasha|nashe|ganja|charas|sharab|alcohol|smoking|cigarette|vape)$/],
  ["weapons", /^(?:gun|guns|weapon|weapons|firearms|bandook|pistol|bomb|explosive|knife)$/],
  ["gambling", /^(?:gambling|betting|bet|juaa|juwa|satta|casino)$/],
  ["adult-content", /^(?:porn|pornography|sex|sexual|nudes|ashleel)$/],
  ["hate-abuse", /^(?:hate|abuse|bully|harass|slur|nafrat|gaali)$/],
  ["extremism", /^(?:terrorism|terrorist|extremism|extremist|aatank|jihad)$/],
  ["cheating", /^(?:cheating|cheat|plagiarism|nakal|examcheat)$/],
];

export function blocklistRule(value: string) {
  const normalized = normaliseSafetyText(value);
  return codeRules.find(([, pattern]) => pattern.test(value))?.[0]
    ?? normalizedRules.find(([, pattern]) => pattern.test(normalized))?.[0]
    ?? compactExactRules.find(([, pattern]) => pattern.test(normalized.replace(/\s+/g, "")))?.[0];
}
