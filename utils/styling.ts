import { Dimensions } from 'react-native';

const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;

export function scale(size: number) {
  const { width } = Dimensions.get('window');
  const effectiveWidth = width > 0 ? width : guidelineBaseWidth;
  return (effectiveWidth / guidelineBaseWidth) * size;
}

export function verticalScale(size: number) {
  const { height } = Dimensions.get('window');
  const effectiveHeight = height > 0 ? height : guidelineBaseHeight;
  return (effectiveHeight / guidelineBaseHeight) * size;
}
