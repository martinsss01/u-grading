/** Mirrors the backend `Semester` enum values (backend/app/models/enums.py). */
export const SEMESTER = {
  FALL: "Otoño",
  SPRING: "Primavera",
} as const;

export type SemesterName = (typeof SEMESTER)[keyof typeof SEMESTER];

export type CurrentSemester = {
  semester: SemesterName;
  year: number;
};

/**
 * Returns the current academic semester (name + year) based on the given
 * date (defaults to now), following the Chilean academic calendar:
 *
 *  - Mar–Jul  -> Otoño (1st semester) of that year
 *  - Aug–Dec  -> Primavera (2nd semester) of that year
 *  - Jan–Feb  -> summer break, treated as the tail of the previous year's
 *               Primavera semester
 */
export function getCurrentSemester(date: Date = new Date()): CurrentSemester {
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();

  if (month >= 3 && month <= 7) {
    return { semester: SEMESTER.FALL, year };
  }
  if (month >= 8 && month <= 12) {
    return { semester: SEMESTER.SPRING, year };
  }
  return { semester: SEMESTER.SPRING, year: year - 1 };
}
