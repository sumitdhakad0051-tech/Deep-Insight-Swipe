// Test IDs for the Interest Onboarding feature (Spotify-style)

export const ONBOARDING = {
  section: 'onboarding-section',
  chip: (label) => `chip-${label.replace(/\s+/g, '-').toLowerCase()}`,
  manualInput: 'manual-interest-input',
  manualAdd: 'manual-interest-add',
  skipBtn: 'onboarding-skip-btn',
  continueBtn: 'onboarding-continue-btn',
  useSavedBtn: 'onboarding-use-saved-btn',
  startFreshBtn: 'onboarding-start-fresh-btn',
  selectedCounter: 'onboarding-selected-counter',
  myInterestsLink: 'nav-my-interests',
};

export const MYINT = {
  page: 'my-interests-page',
  list: 'my-interests-list',
  item: (i) => `my-interest-item-${i}`,
  remove: (i) => `my-interest-remove-${i}`,
  addInput: 'my-interests-add-input',
  addBtn: 'my-interests-add-btn',
  clearAll: 'my-interests-clear-all',
  useInFeed: 'my-interests-use-in-feed',
};
