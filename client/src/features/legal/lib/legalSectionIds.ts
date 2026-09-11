/** Must match `legal.termsOfUse.sections.*` keys in locale JSON files. */
export const TERMS_OF_USE_SECTION_IDS = [
  'generalProvisions',
  'useOfServicesAndConduct',
  'personalDataConsent',
  'inactiveAccounts',
  'contentStandards',
  'monitoring',
  'noProfessionalAdvice',
  'userWarranties',
  'intellectualProperty',
  'liability',
  'risksAndRestrictions',
  'payments',
  'referralProgram',
  'thirdPartyAndAdvertising',
  'amendments',
  'electronicCommunications',
  'governingLawDisputes',
  'regulatoryCompliancePrograms',
  'finalProvisions',
  'contact',
] as const;

/** Must match `legal.privacyPolicy.sections.*` keys in locale JSON files. */
export const PRIVACY_POLICY_SECTION_IDS = [
  'controllerContact',
  'scopeDefinitions',
  'categoriesCollected',
  'purposesLegalBases',
  'cookiesIdentifiers',
  'walletsBlockchain',
  'minors',
  'sources',
  'recipients',
  'internationalTransfers',
  'retentionSecurity',
  'breachesAutomation',
  'rights',
  'marketingOptOut',
  'updatesComplaints',
] as const;

/** Must match `legal.cookiePolicy.sections.*` keys in locale JSON files. */
export const COOKIE_POLICY_SECTION_IDS = [
  'whatAreCookies',
  'howWeUseThem',
  'essentialCookies',
  'functionalCookies',
  'analyticsAdvertisingCookies',
  'thirdPartyCookies',
  'yourChoices',
  'browserControls',
  'retention',
  'updatesContact',
] as const;
