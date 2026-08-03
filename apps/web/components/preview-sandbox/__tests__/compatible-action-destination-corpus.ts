export const ACTION_DESTINATION_CORPUS = [
  { id: "relative", destination: "letters/new", accepted: true },
  { id: "root-relative", destination: "/letters?template=classic", accepted: true },
  { id: "https", destination: "https://www.example.com/letters", accepted: true },
  { id: "raw-javascript", destination: "javascript:alert(1)", accepted: false },
  { id: "encoded-javascript", destination: "javascript%3Aalert(1)", accepted: false },
  { id: "double-encoded-data", destination: "data%253Atext/html,boom", accepted: false },
  { id: "scheme-relative", destination: "//evil.test/path", accepted: false },
  { id: "encoded-scheme-relative", destination: "%2f%2fevil.test/path", accepted: false },
  { id: "traversal", destination: "../secret", accepted: false },
  { id: "triple-encoded-traversal", destination: "/%25252e%25252e/secret", accepted: false },
  {
    id: "triple-encoded-scheme-relative",
    destination: "%25252f%25252fevil.test/path",
    accepted: false,
  },
] as const
