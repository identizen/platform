/** Vite's `?raw` import of a text file (used to read spec/openapi.yaml in tests). */
declare module '*.yaml?raw' {
  const text: string;
  export default text;
}
