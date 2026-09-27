// src/lib/locations-data.ts
//
// Add one entry per department / office / cabin you want the chatbot to be
// able to point people to. For each entry:
//   1. Save a photo of that spot into /public/locations/ (any name you like)
//   2. Set imageUrl below to "/locations/your-file-name.jpg"
//   3. List a few keywords/phrases students might type when asking about it
//
// The chatbot matches the student's question against `keywords`, so include
// a few natural variations (short names, common misspellings, etc).

export interface LocationEntry {
  id: string;
  keywords: string[];
  department: string;
  description: string;
  imageUrl?: string; // optional — omit if you don't have a photo yet
}

export const locations: LocationEntry[] = [
  {
    id: "sharad-auditorium",
    keywords: [
      "sharad auditorium",
      "sharad hall",
      "auditorium",
    ],
    department: "Sharad Auditorium",
    description:
      "Sharad Auditorium lies near Pharmacy College, in front of the Girls Hostel.",
    imageUrl: "/locations/sharad-auditorium.jpg",
  },
  // Add more locations below, following the same shape as above:
  // {
  //   id: "library",
  //   keywords: ["library", "reading room"],
  //   department: "Library",
  //   description: "The library is in B Building, ground floor, next to the main entrance.",
  //   imageUrl: "/locations/library.jpg",
  // },
];