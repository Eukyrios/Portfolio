// Values that more than one module reassigns (an imported binding is read-only).
export const state = {
  bigIdx: 0,
  smallIdx: 0,
  fedCount: 0,
  lostCount: 0,
  clock: 0,
  openProj: null,
  navHover: null,
  currentView: "pond",
  introT0: performance.now(),
  aboutDecodeT: -9,
};
