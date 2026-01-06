import { useState } from 'react';
import { useUser } from '../../context/UserContext';
import { GoogleLogin } from '@react-oauth/google';

export default function AuthModal({ onClose }) {
  const [mode, setMode] = useState('login'); // login, signup, forgot
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const { login } = useUser();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    const endpoint = mode === 'login' ? '/api/users/login' : '/api/users/register';
    const body = mode === 'login' 
      ? { email, password } 
      : { email, password, username };

    try {
      const res = await fetch(`http://localhost:5001${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.message || 'Something went wrong');
      
      if (mode === 'login' || mode === 'signup') {
        login(data.user, data.token);
        onClose();
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await fetch('http://localhost:5001/api/users/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credentialResponse.credential })
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.message || 'Google login failed');
      
      login(data.user, data.token); // Note: backend returns 'accessToken' but we use 'token' in context? Let's check context.
      // Context uses 'login(userData, newToken)'. Backend returns { user, accessToken }.
      // So we should pass data.accessToken.
      login(data.user, data.accessToken);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGoogleError = () => {
    setError('Google Login Failed');
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-800/95 backdrop-blur-xl p-8 rounded-2xl shadow-2xl w-96 relative border border-slate-700/50">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 transition-colors text-xl"
        >
          ✕
        </button>

        <h2 className="text-2xl font-bold mb-6 text-center text-slate-100">
          {mode === 'login' && 'Login'}
          {mode === 'signup' && 'Create Account'}
          {mode === 'forgot' && 'Reset Password'}
        </h2>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg mb-4 backdrop-blur-sm">
            {error}
          </div>
        )}

        {mode !== 'forgot' ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-slate-300">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-600 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 bg-slate-700/50 text-slate-100 p-2 placeholder-slate-400"
                  required
                />
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-slate-300">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-600 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 bg-slate-700/50 text-slate-100 p-2 placeholder-slate-400"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-600 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 bg-slate-700/50 text-slate-100 p-2 placeholder-slate-400"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-blue-500/30"
            >
              {mode === 'login' ? 'Sign In' : 'Sign Up'}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-slate-800/95 text-slate-400">Or continue with</span>
              </div>
            </div>

            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                useOneTap
              />
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Enter your email address and we'll send you a link to reset your password.
            </p>
            <input
              type="email"
              placeholder="Email address"
              className="block w-full rounded-lg border border-slate-600 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 bg-slate-700/50 text-slate-100 p-2 placeholder-slate-400"
            />
            <button
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 border border-blue-500/30"
              onClick={() => alert('Password reset link sent (simulated)')}
            >
              Send Reset Link
            </button>
          </div>
        )}

        <div className="mt-6 text-center text-sm">
          {mode === 'login' && (
            <>
              <button onClick={() => setMode('forgot')} className="text-blue-400 hover:text-blue-300 block w-full mb-2">
                Forgot password?
              </button>
              <span className="text-slate-400">Don't have an account? </span>
              <button onClick={() => setMode('signup')} className="text-blue-400 hover:text-blue-300 font-medium">
                Sign up
              </button>
            </>
          )}
          {mode === 'signup' && (
            <>
              <span className="text-slate-400">Already have an account? </span>
              <button onClick={() => setMode('login')} className="text-blue-400 hover:text-blue-300 font-medium">
                Log in
              </button>
            </>
          )}
          {mode === 'forgot' && (
            <button onClick={() => setMode('login')} className="text-blue-400 hover:text-blue-300 font-medium">
              Back to Login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
