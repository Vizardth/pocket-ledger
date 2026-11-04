// What the screen is currently showing. Not saved between app launches.

import { thisMonth } from "./utils.js";

export const ui = {
  month: thisMonth,   // "YYYY-MM" being viewed
  tab: "month",       // "month" | "bills" | "report" | "more"
  loaded: false,      // true once saved data has been read

  // Claude analysis on the Report tab
  analysis: {
    month: "",        // which month the text belongs to
    text: "",
    isError: false,
    isBusy: false,
  },
};
