/**
 * Fast disposable / temporary email domain detector.
 * Blocks burner and throwaway mail services (e.g. temp-mail, 10minutemail, guerrillamail).
 * Used at registration to prevent botnets and mass fake referral generation.
 */

const DISPOSABLE_DOMAINS = new Set<string>([
  // Popular / widespread disposable services
  "10minutemail.com",
  "10minutemail.net",
  "10minutemail.org",
  "10minutemail.co.uk",
  "20minutemail.com",
  "airmail.cc",
  "anonbox.net",
  "anonymousemail.me",
  "baxomale.ht",
  "bccto.me",
  "binkmail.com",
  "bobmail.info",
  "burnermail.io",
  "byom.de",
  "chacuo.net",
  "crazymailing.com",
  "cuvox.de",
  "dayrep.com",
  "deadaddress.com",
  "dispostable.com",
  "discard.email",
  "discardmail.com",
  "disposablemail.com",
  "dropmail.me",
  "drdrb.com",
  "emkei.cz",
  "eyepaste.com",
  "fakeinbox.com",
  "fakemailgenerator.com",
  "fleckens.hu",
  "getairmail.com",
  "getnada.com",
  "grr.la",
  "guerrillamail.biz",
  "guerrillamail.com",
  "guerrillamail.de",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "gustr.com",
  "harakirimail.com",
  "hidemail.de",
  "inboxalias.com",
  "inboxbear.com",
  "inboxkitten.com",
  "incognitomaill.org",
  "jetable.org",
  "jourrapide.com",
  "kasmail.com",
  "klzlk.com",
  "mail-temporaire.fr",
  "mailcatch.com",
  "maildrop.cc",
  "mailexpire.com",
  "mailforspam.com",
  "mailimate.com",
  "mailinator.com",
  "mailinator.net",
  "mailinator2.com",
  "mailnesia.com",
  "mailnull.com",
  "mailpoof.com",
  "mailsac.com",
  "mailseal.de",
  "mailslurp.com",
  "mailtothis.com",
  "mintemail.com",
  "mohmal.com",
  "mohmal.in",
  "mytemp.email",
  "mytrashmail.com",
  "nada.ltd",
  "nada.privatemail.net",
  "netmails.net",
  "no-spam.ws",
  "nospam.ze.tc",
  "nowmymail.com",
  "oneoffmail.com",
  "pookmail.com",
  "privacymail.org",
  "qq.com.fake",
  "quickinbox.com",
  "rcpt.at",
  "rhyta.com",
  "safemail.icu",
  "safetymail.info",
  "sharklasers.com",
  "shitmail.me",
  "shitmail.org",
  "spambog.com",
  "spambog.de",
  "spambox.us",
  "spamfree24.org",
  "spamgourmet.com",
  "spamhole.com",
  "spaml.de",
  "superrito.com",
  "tagmail.org",
  "teleworm.us",
  "temp-mail.com",
  "temp-mail.de",
  "temp-mail.io",
  "temp-mail.org",
  "temp-mail.ru",
  "tempail.com",
  "tempinbox.com",
  "tempmail.altmails.com",
  "tempmail.com",
  "tempmail.de",
  "tempmail.gg",
  "tempmail.net",
  "tempmail.ninja",
  "tempmail.plus",
  "tempmail.space",
  "tempmail.us",
  "tempmail24.com",
  "tempmailaddress.com",
  "tempmailer.com",
  "tempmailer.net",
  "tempm.com",
  "throwawaymail.com",
  "throwawayemailaddress.com",
  "trash-mail.at",
  "trash-mail.com",
  "trashmail.at",
  "trashmail.ch",
  "trashmail.com",
  "trashmail.de",
  "trashmail.io",
  "trashmail.me",
  "trashmail.net",
  "trashmail.org",
  "trashmail.ws",
  "trashmailer.com",
  "tuamaeaquelaursa.com",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "yopmail.org",
  "cool.fr.nf",
  "jetable.fr.nf",
  "nospam.ze.tc",
  "nomail.xl.cx",
  "mega.zik.dj",
  "speed.1s.fr",
  "courriel.fr.nf",
  "moncourrier.fr.nf",
  "monemail.fr.nf",
  "monmail.fr.nf",
  "zillamail.com",
  "zippymail.info",
]);

const DISPOSABLE_DOMAIN_KEYWORDS = [
  "tempmail",
  "temp-mail",
  "disposable",
  "throwaway",
  "trashmail",
  "fakeinbox",
  "guerrillamail",
  "mailinator",
  "burnermail",
  "10minutemail",
  "sharklasers",
  "yopmail",
];

export function extractEmailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at === -1) return "";
  return email.slice(at + 1).trim().toLowerCase();
}

/**
 * Checks whether the email uses a known temporary, burner or disposable domain.
 */
export function isDisposableEmail(email: unknown): boolean {
  if (typeof email !== "string") return false;
  const domain = extractEmailDomain(email);
  if (!domain) return false;

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return true;
  }

  // Check subdomains (e.g. foo.yopmail.com, abc.guerrillamail.com)
  const parts = domain.split(".");
  if (parts.length > 2) {
    const parentDomain = parts.slice(-2).join(".");
    if (DISPOSABLE_DOMAINS.has(parentDomain)) {
      return true;
    }
  }

  // Generic keyword match in the domain name
  for (const kw of DISPOSABLE_DOMAIN_KEYWORDS) {
    if (domain.includes(kw)) {
      return true;
    }
  }

  return false;
}
