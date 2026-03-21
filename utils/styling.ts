import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');
const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;

export function scale(size: number) {
  return (width / guidelineBaseWidth) * size;
}

export function verticalScale(size: number) {
  return (height / guidelineBaseHeight) * size;
}
