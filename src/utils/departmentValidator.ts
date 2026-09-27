/**
 * Complete official department list for Jadavpur University
 * Sources: ju.ac.in - Faculty of Engineering & Technology, Faculty of Arts,
 *          Faculty of Science & Engineering (interdisciplinary), Faculty of Law
 */
export const JADAVPUR_DEPARTMENTS: readonly string[] = [
  // ─── FACULTY OF ENGINEERING & TECHNOLOGY ───────────────────────────────────
  "Architecture",
  "Chemical Engineering",
  "Civil Engineering",
  "Computer Science & Engineering",
  "Construction Engineering",
  "Electrical Engineering",
  "Electronics & Telecommunication Engineering",
  "Food Technology & Biochemical Engineering",
  "Information Technology",
  "Instrumentation & Electronics Engineering",
  "Mechanical Engineering",
  "Metallurgical & Material Engineering",
  "Pharmaceutical Technology",
  "Power Engineering",
  "Printing Engineering",
  "Production Engineering",
  // ─── FACULTY OF ARTS ────────────────────────────────────────────────────────
  "Bengali",
  "Comparative Literature",
  "Economics",
  "Education",
  "English",
  "Film Studies",
  "Geography",
  "History",
  "International Relations",
  "Journalism & Mass Communication",
  "Library & Information Science",
  "Linguistics",
  "Music",
  "Philosophy",
  "Political Science",
  "Psychology",
  "Public Administration",
  "Sanskrit",
  "Social Work",
  "Sociology",
  "Urdu",
  // ─── FACULTY OF SCIENCE & ENGINEERING ─────────────────────────────────────
  "Applied Mathematics",
  "Applied Physics",
  "Astronomy",
  "Astrophysics",
  "Biochemistry",
  "Biotechnology",
  "Botany",
  "Chemistry",
  "Computer Science",
  "Electronics Science",
  "Environmental Science",
  "Geological Sciences",
  "Life Science & Biotechnology",
  "Mathematics",
  "Microbiology",
  "Molecular Biology",
  "Physics",
  "Statistics",
  "Zoology",
  // ─── FACULTY OF LAW ────────────────────────────────────────────────────────
  "Law",
  // ─── INTERDISCIPLINARY / CENTRES ───────────────────────────────────────────
  "Business Management",
  "Cognitive Science",
  "Data Science",
  "Energy Studies",
  "Materials Science",
  "Nanoscience & Nanotechnology",
  "Rural Development Studies",
  "Women's Studies"
] as const;

export function validateDepartmentName(input: string): { isValid: boolean; normalized?: string; suggestion?: string } {
  const trimmed = input.trim();
  if (!trimmed) return { isValid: false };

  const exactMatch = JADAVPUR_DEPARTMENTS.find(d => d.toLowerCase() === trimmed.toLowerCase());
  if (exactMatch) return { isValid: true, normalized: exactMatch };

  // Levenshtein fuzzy approximation check
  const levenshtein = (a: string, b: string): number => {
    const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
        matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
      }
    }
    return matrix[a.length][b.length];
  };

  let bestMatch = "";
  let lowestDistance = Infinity;
  for (const dept of JADAVPUR_DEPARTMENTS) {
    const dist = levenshtein(dept, trimmed);
    if (dist < lowestDistance) {
      lowestDistance = dist;
      bestMatch = dept;
    }
  }

  if (lowestDistance <= 5) {
    return { isValid: false, suggestion: bestMatch };
  }

  return { isValid: false };
}
