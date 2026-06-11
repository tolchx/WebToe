import { EditorApp, type EditorOptions } from './app';

export { EditorApp, type EditorOptions } from './app';
export { FAMILY_COLORS } from './style';

/** Mount the WebToe editor into a host element. */
export async function mountEditor(el: HTMLElement, opts: EditorOptions = {}): Promise<EditorApp> {
  const app = new EditorApp(el, opts);
  await app.start();
  return app;
}
