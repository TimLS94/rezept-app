import { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { HEADER_TOP } from '../lib/layout';
import { supabase } from '../lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';

WebBrowser.maybeCompleteAuthSession();
import { useAuth, canUploadRecipes } from '../lib/auth';

export default function LoginScreen() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  // Route by role after auth: creators go to their Studio, everyone else Home.
  const landAfterAuth = async () => {
    const role = await refresh();
    router.replace(canUploadRecipes(role) ? '/creator' : '/home');
  };

  // Passwordless email-code mode (more robust on mobile than a magic-link deep link).
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        // Without emailRedirectTo, Supabase falls back to the project's Site
        // URL — which is still localhost:3000, so the confirmation link in the
        // email leads nowhere on a phone. This sends people back into the app.
        // The same URL must be whitelisted under Authentication → URL
        // Configuration → Redirect URLs, or Supabase ignores it.
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: AuthSession.makeRedirectUri({ native: 'spoondrop://' }),
          },
        });
        if (error) throw error;
        Alert.alert('Success', 'Check your email for verification link!');
        return;
      }
      await landAfterAuth();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const sendCode = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setOtpSent(true);
    Alert.alert('Check your email', `We sent a 6-digit code to ${email}.`);
  };

  const verifyCode = async () => {
    if (code.length < 6) {
      Alert.alert('Error', 'Enter the 6-digit code from your email');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    await landAfterAuth();
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const redirectUrl = AuthSession.makeRedirectUri({ native: 'spoondrop://' });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        if (result.type === 'success' && result.url) {
          const params = new URL(result.url).hash.substring(1);
          const urlParams = new URLSearchParams(params);
          const accessToken = urlParams.get('access_token');
          const refreshToken = urlParams.get('refresh_token');
          
          if (accessToken && refreshToken) {
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            await landAfterAuth();
          }
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Google sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No identity token from Apple');

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;

      // Apple only sends the name on the very first sign-in — capture it then.
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();
      if (fullName) {
        await supabase.auth.updateUser({ data: { full_name: fullName } }).catch(() => {});
      }
      await landAfterAuth();
    } catch (error: any) {
      // User dismissing the Apple sheet is not an error worth surfacing.
      if (error?.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Error', error.message || 'Apple sign in failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Image */}
        <View style={styles.heroContainer}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=800' }}
            style={styles.heroImage}
          />
          <View style={styles.heroOverlay} />
          {/* A way out. Reaching this screen from Settings or a paywall used to
              be one-way: the only exits were signing in or "continue as guest",
              and that second one signs you out. Someone who tapped it by
              mistake lost their session to get back. */}
          {router.canGoBack() && (
            <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          )}
          <View style={styles.heroContent}>
            <Text style={styles.logo}>SpoonDrop</Text>
            <Text style={styles.tagline}>What's the best way to feed{'\n'}your family tonight?</Text>
          </View>
        </View>

        {/* Auth Form */}
        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>
            {isLogin ? 'Welcome Back!' : 'Create Account'}
          </Text>
          <Text style={styles.formSubtitle}>
            {isLogin 
              ? 'Sign in to discover family-friendly meals' 
              : 'Join thousands of happy families'}
          </Text>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="your@email.com"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {mode === 'password' ? (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#999"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                style={styles.forgotPassword}
                onPress={() => { setMode('code'); setOtpSent(false); }}
              >
                <Text style={styles.forgotPasswordText}>Email me a login code instead</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={handleAuth}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {isLogin ? 'Sign In' : 'Create Account'}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              {otpSent && (
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>6-digit code</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="123456"
                    placeholderTextColor="#999"
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={otpSent ? verifyCode : sendCode}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {otpSent ? 'Verify & Sign In' : 'Send me a code'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.forgotPassword}
                onPress={() => { setMode('password'); setCode(''); }}
              >
                <Text style={styles.forgotPasswordText}>Use password instead</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.socialButtons}>
            <TouchableOpacity style={styles.socialButton} onPress={handleGoogleSignIn}>
              <Ionicons name="logo-google" size={18} color="#DB4437" />
              <Text style={styles.socialButtonText}>Google</Text>
            </TouchableOpacity>
            {Platform.OS === 'ios' && (
              <TouchableOpacity style={styles.socialButton} onPress={handleAppleSignIn}>
                <Ionicons name="logo-apple" size={20} color="#000" />
                <Text style={styles.socialButtonText}>Apple</Text>
              </TouchableOpacity>
            )}
          </View>

          {mode === 'password' && (
            <TouchableOpacity
              style={styles.switchAuth}
              onPress={() => setIsLogin(!isLogin)}
            >
              <Text style={styles.switchAuthText}>
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <Text style={styles.switchAuthLink}>
                  {isLogin ? 'Sign Up' : 'Sign In'}
                </Text>
              </Text>
            </TouchableOpacity>
          )}

          {/* Continue as guest — clear any lingering session so it's a true guest */}
          <TouchableOpacity
            style={styles.guestLink}
            onPress={async () => { await supabase.auth.signOut(); router.replace('/home'); }}
          >
            <Text style={styles.guestLinkText}>Continue browsing as guest</Text>
          </TouchableOpacity>

          {/* Creator login */}
          <TouchableOpacity style={styles.creatorLink} onPress={() => router.push('/influencer-login')}>
            <Text style={styles.creatorLinkText}>👨‍🍳 Are you a creator? Sign in here</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  scrollContent: {
    flexGrow: 1,
  },
  heroContainer: {
    height: 280,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    top: HEADER_TOP,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  heroContent: {
    position: 'absolute',
    bottom: 30,
    left: 24,
    right: 24,
  },
  logo: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 26,
  },
  formContainer: {
    flex: 1,
    padding: 24,
    paddingTop: 32,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -20,
  },
  formTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1A1A1A',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: '#F2701E',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#F2701E',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginBottom: 24,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#999',
    fontSize: 14,
  },
  socialButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 6,
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  switchAuth: {
    alignItems: 'center',
  },
  switchAuthText: {
    fontSize: 15,
    color: '#666',
  },
  switchAuthLink: {
    color: '#F2701E',
    fontWeight: '600',
  },
  guestLink: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 8,
  },
  guestLinkText: {
    fontSize: 15,
    color: '#999',
    fontWeight: '600',
  },
  creatorLink: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF8F0',
    borderRadius: 12,
  },
  creatorLinkText: {
    fontSize: 15,
    color: '#8B4513',
    fontWeight: '600',
  },
});
