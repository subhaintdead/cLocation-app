import React, { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Share from './src/Share';
import Watch from './src/Watch';
import { parseCode } from './src/links';
import { Btn, C, s } from './src/ui';

export default function App() {
  const [screen, setScreen] = useState<'home' | 'share' | 'watch'>('home');
  // a tapped link (https://.../watch?code=XYZ or clocation://watch?code=XYZ) opens Watch and starts watching
  const [link, setLink] = useState<{ code: string; n: number } | null>(null);

  useEffect(() => {
    const open = (url: string | null) => {
      const code = parseCode(url);
      if (code) { setLink({ code, n: Date.now() }); setScreen('watch'); }
    };
    Linking.getInitialURL().then(open).catch(() => { });
    const sub = Linking.addEventListener('url', (e) => open(e.url));
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.screen}>
        <StatusBar style="light" />
        {screen === 'home' && (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={[s.code, { letterSpacing: 1, fontSize: 36, marginBottom: 32 }]}>cLocation</Text>
            <Btn label="Share" onPress={() => setScreen('share')} />
            <Btn label="Watch" color={C.card} onPress={() => setScreen('watch')} />
          </View>
        )}
        {screen === 'share' && <Share onBack={() => setScreen('home')} />}
        {screen === 'watch' && <Watch key={link?.n ?? 0} initialCode={link?.code} onBack={() => { setLink(null); setScreen('home'); }} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
