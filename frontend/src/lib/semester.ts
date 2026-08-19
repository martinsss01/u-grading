/** Mirrors the backend `Semester` enum values (backend/app/models/enums.py). */
export const SEMESTER = {
  FALL: "Otoño",
  SPRING: "Primavera",
  SUMMER: "Verano",
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
 *  - Aug–Nov  -> Primavera (2nd semester) of that year
 *  - Dec–Jan  -> Verano (summer term); December belongs to that year's
 *               Verano, January to the tail of the previous year's
 *  - Feb      -> gap between Verano and Otoño, treated as the tail of the
 *               previous year's Primavera
 */
export function getCurrentSemester(date: Date = new Date()): CurrentSemester {
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();

  if (month >= 3 && month <= 7) {
    return { semester: SEMESTER.FALL, year };
  }
  if (month >= 8 && month <= 11) {
    return { semester: SEMESTER.SPRING, year };
  }
  if (month === 12) {
    return { semester: SEMESTER.SUMMER, year };
  }
  if (month === 1) {
    return { semester: SEMESTER.SUMMER, year: year - 1 };
  }
  return { semester: SEMESTER.SPRING, year: year - 1 };
}
