import { Tabs } from 'expo-router';

// Orientation is controlled centrally by DeviceProvider (device-context):
// TV = landscape only, Phone = free. This layout must NOT lock orientation,
// otherwise it would override the phone's freedom to rotate.
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
    </Tabs>
  );
}
