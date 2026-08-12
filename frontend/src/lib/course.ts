// Sections aren't numbered in the data model yet, so every section displays
// as "1" for now.
const HARDCODED_SECTION_NUMBER = 1;

/** Second-line label for a course: "CODE - SECTION_NUMBER". */
export function courseCodeLabel(course: { code: string }, sectionNumber: number = HARDCODED_SECTION_NUMBER) {
  return `${course.code} - ${sectionNumber}`;
}
