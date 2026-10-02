// Import only the Ionicons set: the `@expo/vector-icons` barrel pulls every icon family's glyph map (and, on web,
// registers all their fonts) into the entry bundle, which costs mothers on 3G seconds of loading.
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';

export type IconName = keyof typeof Ionicons.glyphMap;
type Props = React.ComponentProps<typeof Ionicons>;

/**
 * An Ionicons glyph. Icons sit next to words, so they are hidden from screen readers by default (otherwise
 * TalkBack reads a private-use character). Pass `accessibilityLabel` for an icon that stands on its own.
 */
export function Icon(props: Props) {
  const hidden = props['aria-hidden'] ?? !(props.accessibilityLabel || props['aria-label']);
  return <Ionicons {...props} aria-hidden={hidden} />;
}
