import React from 'react';
import { Text, TextInput } from 'react-native';
import { FONTS } from './theme';

// Make Poppins the app-wide default font so every screen inherits the brand
// typography (screens that set an explicit fontFamily — e.g. Anton headlines —
// still win, because their style is applied last). Done by wrapping the base
// Text/TextInput render so we don't have to touch every <Text> in the app.
let applied = false;

export function applyGlobalFont() {
  if (applied) return;
  applied = true;

  [Text, TextInput].forEach((Comp: any) => {
    const original = Comp.render;
    if (typeof original !== 'function') return;
    Comp.render = function patched(...args: any[]) {
      const element = original.apply(this, args);
      if (!element || !React.isValidElement(element)) return element;
      // Poppins first so per-component styles override everything except an
      // unspecified fontFamily.
      return React.cloneElement(element as React.ReactElement<any>, {
        style: [{ fontFamily: FONTS.body }, (element as any).props?.style],
      });
    };
  });
}
