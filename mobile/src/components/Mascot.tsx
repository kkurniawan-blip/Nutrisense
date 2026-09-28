import React, { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

export type Mood = 'happy' | 'thinking' | 'cheer' | 'caring';

/**
 * Nuri, the NutriSense sprout: a little seedling that grows with the child.
 * Drawn in SVG so it looks identical on every phone (no emoji font dependency).
 */
export function Mascot({ size = 96, mood = 'happy', bounce = false }: { size?: number; mood?: Mood; bounce?: boolean }) {
  const [y] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!bounce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -6, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bounce, y]);

  const eyeY = mood === 'thinking' ? 55 : 58;
  return (
    <Animated.View style={{ transform: [{ translateY: y }] }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {/* sprout */}
        <Path d="M50 30 C50 22 50 18 50 14" stroke="#2FB38A" strokeWidth={4} strokeLinecap="round" fill="none" />
        <Path d="M50 18 C40 6 26 10 26 18 C34 24 44 22 50 18 Z" fill="#46C89E" />
        <Path d="M50 16 C58 2 76 6 76 14 C68 22 57 21 50 16 Z" fill="#2FB38A" />
        {/* body */}
        <Ellipse cx={50} cy={62} rx={34} ry={31} fill="#FFD6BF" />
        <Ellipse cx={50} cy={68} rx={24} ry={18} fill="#FFE6D6" />
        {/* cheeks */}
        <Circle cx={30} cy={68} r={6} fill="#FF9E9E" opacity={0.7} />
        <Circle cx={70} cy={68} r={6} fill="#FF9E9E" opacity={0.7} />
        {/* eyes */}
        {mood === 'cheer' ? (
          <G stroke="#3B2F3A" strokeWidth={3.2} strokeLinecap="round" fill="none">
            <Path d="M34 58 Q39 52 44 58" />
            <Path d="M56 58 Q61 52 66 58" />
          </G>
        ) : (
          <G>
            <Circle cx={39} cy={eyeY} r={4.5} fill="#3B2F3A" />
            <Circle cx={61} cy={eyeY} r={4.5} fill="#3B2F3A" />
            <Circle cx={40.5} cy={eyeY - 1.6} r={1.5} fill="#fff" />
            <Circle cx={62.5} cy={eyeY - 1.6} r={1.5} fill="#fff" />
          </G>
        )}
        {mood === 'caring' && (
          <G stroke="#3B2F3A" strokeWidth={2} strokeLinecap="round">
            <Path d="M33 49 L43 51" />
            <Path d="M67 49 L57 51" />
          </G>
        )}
        {/* mouth */}
        {mood === 'thinking' ? (
          <Circle cx={52} cy={72} r={3.2} fill="#3B2F3A" />
        ) : mood === 'caring' ? (
          <Path d="M43 73 Q50 76 57 73" stroke="#3B2F3A" strokeWidth={3} strokeLinecap="round" fill="none" />
        ) : (
          <Path d="M41 69 Q50 80 59 69 Z" fill="#E0564A" stroke="#3B2F3A" strokeWidth={2.2} strokeLinejoin="round" />
        )}
        {mood === 'thinking' && <Circle cx={80} cy={36} r={4} fill="#EEEAFF" stroke="#8672F2" strokeWidth={1.5} />}
      </Svg>
    </Animated.View>
  );
}
