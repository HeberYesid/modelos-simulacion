import { renderPublicObservedDisclosure } from "./public-observed-disclosure";

export interface ObservedSectionHandle { dispose(): void }

export function renderObservedSection(): string {
  return renderPublicObservedDisclosure();
}

export function mountObservedSection(_root: HTMLElement): ObservedSectionHandle {
  return { dispose() {} };
}
