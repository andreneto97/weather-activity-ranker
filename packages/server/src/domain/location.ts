/**
 * A resolved geographic location — provider-agnostic.
 * See specs/01-domain-model.spec.md.
 */
export interface Location {
  readonly id: string; // stable geocoder id, opaque to client
  readonly name: string; // "Chamonix-Mont-Blanc"
  readonly country: string; // "France"
  readonly admin1?: string; // "Auvergne-Rhône-Alpes"
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string; // IANA, e.g. "Europe/Paris"
  readonly population?: number; // drives ambiguity heuristic (spec 08)
}
