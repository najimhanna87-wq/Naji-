import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

// ألوان افتراضية بديلة في حال لم يتم العثور على ملف الألوان لتجنب الانهيار
const DEFAULT_COLORS = {
  accent: '#6200EE',
  light: { tint: '#6200EE' },
  dark: { tint: '#BB86FC' }
};

// محاولة استيراد ملف الألوان بأمان
let SimaColors: any = DEFAULT_COLORS;
try {
  // يمكنك فك التعليق عن السطر بالأسفل إذا أردت تجربة الاستيراد النسبي:
  // SimaColors = require('../../constants/Colors').default || require('../../constants/Colors');
} catch (e) {
  console.warn("Could not load Colors file, using fallback colors.");
}

// تحديد اللون الأساسي بأمان
const primaryColor = SimaColors?.accent || SimaColors?.light?.tint || '#6200EE';

interface UserAvatarProps {
  name?: string;
  imageUrl?: string;
  size?: number;
}

export default function UserAvatar({ name = "User", imageUrl, size = 50 }: UserAvatarProps) {
  // استخراج الحرف الأول من الاسم للعرض كصورة رمزية افتراضية
  const initials = name
    ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: primaryColor }]}>
          <Text style={[styles.text, { fontSize: size * 0.4 }]}>{initials}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  fallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  }
});