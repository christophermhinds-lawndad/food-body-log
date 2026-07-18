const DAY_ID_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function getLocalDayID(dateLike = new Date()) {
  const date = normalizeDate(dateLike);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getTodayDayID(options = {}) {
  return getLocalDayID(options.now || new Date());
}

export function getTomorrowDayID(options = {}) {
  const date = normalizeDate(options.now || new Date());
  date.setDate(date.getDate() + 1);

  return getLocalDayID(date);
}

export function isEditableDay(dayID, options = {}) {
  if (!DAY_ID_PATTERN.test(String(dayID))) {
    return false;
  }

  const now = normalizeDate(options.now || new Date());
  const editableHours = options.editableHours ?? 72;
  const target = dayIDToLocalDate(dayID);
  const today = dayIDToLocalDate(getLocalDayID(now));
  const ageHours = (today.getTime() - target.getTime()) / 36e5;

  return ageHours >= 0 && ageHours <= editableHours;
}

function normalizeDate(dateLike) {
  return dateLike instanceof Date ? new Date(dateLike.getTime()) : new Date(dateLike);
}

function dayIDToLocalDate(dayID) {
  const [year, month, day] = String(dayID).split("-").map(Number);
  return new Date(year, month - 1, day);
}
