import { useState } from 'react';
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
import { supabase } from '../lib/supabase';

export default function InfluencerLoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');

  const promoteToCreator = async (userId: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ role: 'creator' })
      .eq('id', userId);
    if (error) {
      console.warn('Could not set creator role:', error.message);
    }
  };

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (data.user) await promoteToCreator(data.user.id);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        if (data.user) await promoteToCreator(data.user.id);
        Alert.alert('Success', 'Check your email for verification link!');
        return;
      }
      router.replace('/home');
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
    const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) {
      setLoading(false);
      Alert.alert('Error', error.message);
      return;
    }
    if (data.user) await promoteToCreator(data.user.id);
    setLoading(false);
    router.replace('/home');
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
        {/* Hero Image - Creator themed */}
        <View style={styles.heroContainer}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800' }}
            style={styles.heroImage}
          />
          <View style={styles.heroOverlay} />
          <View style={styles.heroContent}>
            <Text style={styles.badge}>👨‍🍳 CREATOR</Text>
            <Text style={styles.logo}>FeedFamily</Text>
            <Text style={styles.tagline}>Share your recipes{'\n'}with thousands of families</Text>
          </View>
        </View>

        {/* Auth Form */}
        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>
            {isLogin ? 'Creator Login' : 'Become a Creator'}
          </Text>
          <Text style={styles.formSubtitle}>
            {isLogin 
              ? 'Sign in to manage and upload your recipes' 
              : 'Join our community of food creators'}
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
                    {isLogin ? 'Sign In as Creator' : 'Create Creator Account'}
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

          {mode === 'password' && (
            <TouchableOpacity
              style={styles.switchAuth}
              onPress={() => setIsLogin(!isLogin)}
            >
              <Text style={styles.switchAuthText}>
                {isLogin ? "Don't have a creator account? " : "Already a creator? "}
                <Text style={styles.switchAuthLink}>
                  {isLogin ? 'Sign Up' : 'Sign In'}
                </Text>
              </Text>
            </TouchableOpacity>
          )}

          {/* Perks section */}
          <View style={styles.perksContainer}>
            <Text style={styles.perksTitle}>Creator Benefits</Text>
            <View style={styles.perkItem}>
              <Text style={styles.perkIcon}>📤</Text>
              <Text style={styles.perkText}>Upload unlimited recipes</Text>
            </View>
            <View style={styles.perkItem}>
              <Text style={styles.perkIcon}>📊</Text>
              <Text style={styles.perkText}>See how many families cook your dishes</Text>
            </View>
            <View style={styles.perkItem}>
              <Text style={styles.perkIcon}>⭐</Text>
              <Text style={styles.perkText}>Build your creator profile</Text>
            </View>
          </View>

          {/* Back to regular login */}
          <TouchableOpacity style={styles.guestLink} onPress={() => router.back()}>
            <Text style={styles.guestLinkText}>← Back to regular login</Text>
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
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(139, 69, 19, 0.5)',
  },
  heroContent: {
    position: 'absolute',
    bottom: 30,
    left: 24,
    right: 24,
  },
  badge: {
    backgroundColor: '#FFD700',
    color: '#1A1A1A',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 12,
    overflow: 'hidden',
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
    color: '#8B4513',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#8B4513',
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
  switchAuth: {
    alignItems: 'center',
    marginBottom: 32,
  },
  switchAuthText: {
    fontSize: 15,
    color: '#666',
  },
  switchAuthLink: {
    color: '#8B4513',
    fontWeight: '600',
  },
  perksContainer: {
    backgroundColor: '#FFF8F0',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  perksTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  perkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  perkIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  perkText: {
    fontSize: 14,
    color: '#333',
  },
  guestLink: {
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 8,
  },
  guestLinkText: {
    fontSize: 15,
    color: '#999',
    fontWeight: '600',
  },
});
