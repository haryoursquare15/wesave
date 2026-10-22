import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

// A preview shell only. All banking auth and data remain in the web app.
const APP_URL = process.env.EXPO_PUBLIC_VESTARA_URL?.trim() || 'https://wesave.lovable.app/app';

function VestaraPreview() {
  const browser = useRef(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack) return false;
      browser.current?.goBack();
      return true;
    });
    return () => listener.remove();
  }, [canGoBack]);

  function retry() {
    setFailed(false);
    setLoading(true);
    setCanGoBack(false);
    setReloadKey((value) => value + 1);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="light" backgroundColor="#102f52" />
      {failed ? (
        <View style={styles.message}>
          <Text style={styles.heading}>Unable to open Vestara</Text>
          <Text style={styles.description}>Check your connection and make sure the banking website is online.</Text>
          <Pressable style={styles.button} accessibilityRole="button" onPress={retry}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.content}>
          <WebView
            key={reloadKey}
            ref={browser}
            source={{ uri: APP_URL }}
            originWhitelist={['https://*']}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            mixedContentMode="never"
            onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setLoading(false); setFailed(true); }}
            style={styles.webview}
          />
          {loading && (
            <View style={styles.loading} pointerEvents="none">
              <ActivityIndicator size="small" color="#167c69" />
              <Text style={styles.loadingText}>Opening Vestara</Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <VestaraPreview />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#102f52' },
  content: { flex: 1, backgroundColor: '#f6f8fa' },
  webview: { flex: 1, backgroundColor: '#f6f8fa' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center', gap: 12,
    backgroundColor: '#f6f8fa',
  },
  loadingText: { color: '#102f52', fontSize: 13, fontWeight: '600' },
  message: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    gap: 14, paddingHorizontal: 32, backgroundColor: '#f6f8fa',
  },
  heading: { color: '#102f52', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  description: { color: '#687d8b', fontSize: 13, lineHeight: 21, textAlign: 'center' },
  button: { marginTop: 14, paddingHorizontal: 27, paddingVertical: 13, borderRadius: 10, backgroundColor: '#102f52' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
