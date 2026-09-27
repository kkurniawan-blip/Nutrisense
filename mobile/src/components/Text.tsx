import React, { createContext, useContext } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput, TextInputProps, TextProps, TextStyle } from 'react-native';

import { colors, fonts } from '../theme';

// Custom fonts need one family per weight (Android ignores fontWeight for custom families).
function family(weight: TextStyle['fontWeight']): string {
  switch (String(weight ?? '400')) {
    case '900':
    case 'black':
      return fonts.black;
    case '800':
    case 'heavy':
      return fonts.extrabold;
    case '700':
    case 'bold':
      return fonts.bold;
    case '600':
    case '500':
    case 'semibold':
    case 'medium':
      return fonts.semibold;
    default:
      return fonts.regular;
  }
}

/** App-wide text size multiplier chosen in Settings (1 = normal). */
export const TextScaleContext = createContext(1);

function withFont(style: TextProps['style'], scale: number) {
  const flat = StyleSheet.flatten(style) ?? {};
  const { fontWeight, ...rest } = flat as TextStyle;
  const sized: TextStyle = {};
  if (scale !== 1) {
    sized.fontSize = Math.round((rest.fontSize ?? 14) * scale);
    if (typeof rest.lineHeight === 'number') sized.lineHeight = Math.round(rest.lineHeight * scale);
  }
  return [{ color: colors.text }, rest, sized, { fontFamily: family(fontWeight) }];
}

/** Drop-in replacement for react-native Text that applies the rounded Nunito font and the chosen text size. */
export function Text(props: TextProps) {
  const scale = useContext(TextScaleContext);
  return <RNText {...props} style={withFont(props.style, scale)} />;
}

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(function TextInput(props, ref) {
  const scale = useContext(TextScaleContext);
  return <RNTextInput ref={ref} {...props} style={withFont(props.style, scale)} />;
});
