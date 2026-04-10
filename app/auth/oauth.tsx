import React, { useRef, useCallback } from 'react';
import { StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { WebView, WebViewNavigation } from 'react-native-webview';

import { Text, View } from '@/components/Themed';
import {
  getEuropeAuthUrls,
  storeWebviewAuthResult,
} from '@/src/api/regions/europe';
import { useCarStore } from '@/src/store/carStore';

export default function OAuthScreen() {
  const router = useRouter();
  const { bluelink, connect } = useCarStore();
  const handled = useRef(false);

  const manufacturer = bluelink?.getConfig().manufacturer ?? 'hyundai';
  const authUrls = getEuropeAuthUrls(manufacturer);

  if (!authUrls) {
    return (
      <View style={styles.center}>
        <Text>OAuth not required for this manufacturer.</Text>
      </View>
    );
  }

  const handleCallback = useCallback((url: string) => {
    if (handled.current) return;
    if (url.startsWith(authUrls.callbackUrl) && url.includes('code=')) {
      handled.current = true;
      console.log('[OAuth] Got callback with code');
      storeWebviewAuthResult(url).then(() => {
        router.back();
        const config = bluelink?.getConfig();
        if (config) {
          setTimeout(() => connect(config), 300);
        }
      });
    }
  }, [authUrls, router, bluelink, connect]);

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: authUrls.startUrl }}
        style={styles.webview}
        userAgent="Mozilla/5.0 (Linux; Android 4.1.1; Galaxy Nexus Build/JRO03C) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.166 Mobile Safari/535.19"
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        onShouldStartLoadWithRequest={(request) => {
          if (handled.current) return false;
          if (request.url.startsWith(authUrls.callbackUrl) && request.url.includes('code=')) {
            handleCallback(request.url);
            return false;
          }
          return true;
        }}
        onNavigationStateChange={(navState: WebViewNavigation) => {
          handleCallback(navState.url);
        }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Loading login page...</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  webview: { flex: 1 },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { marginTop: 12, fontSize: 14 },
});
