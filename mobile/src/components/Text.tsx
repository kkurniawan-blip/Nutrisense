import React from 'react';
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

function withFont(style: TextProps['style']) {
  const flat = StyleSheet.flatten(style) ?? {};
  const { fontWeight, ...rest } = flat as TextStyle;
  return [{ color: colors.text }, rest, { fontFamily: family(fontWeight) }];
}

/** Drop-in replacement for react-native Text that applies the rounded Nunito font. */
export function Text(props: TextProps) {
  return <RNText {...props} style={withFont(props.style)} />;
}

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(function TextInput(props, ref) {
  return <RNTextInput ref={ref} {...props} style={withFont(props.style)} />;
});
