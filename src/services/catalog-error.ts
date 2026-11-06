export class CatalogException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogException';
  }
}
