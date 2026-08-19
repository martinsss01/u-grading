/** Second-line label for a course: "CODE - SECTION_NUMBER". */
export function courseCodeLabel(course: { code: string }, sectionNumber: number = 1) {
  return `${course.code} - ${sectionNumber}`;
}
