import { useState } from "react";

export function AuthModal({ onLogin }) {
  const [isOpen, setIsOpen] = useState(true);
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ email: "", password: "", username: "" });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.email || !form.password || (!isLogin && !form.username)) {
      alert("Please fill all fields");
      return;
    }
    // In a real app, send to backend. For now, just "log in".
    const user = { id: crypto.randomUUID(), ...form };
    onLogin(user);
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-80 text-gray-800">
        <h2 className="text-xl font-bold mb-4">
          {isLogin ? "Login" : "Sign Up"}
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {!isLogin && (
            <input
              type="text"
              placeholder="Username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="border p-2 rounded"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="border p-2 rounded"
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="border p-2 rounded"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white rounded p-2 mt-2 hover:bg-blue-700"
          >
            {isLogin ? "Login" : "Sign Up"}
          </button>
        </form>
        <p className="text-sm text-center mt-3">
          {isLogin ? "No account?" : "Already have an account?"}{" "}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-blue-600 underline"
          >
            {isLogin ? "Sign Up" : "Login"}
          </button>
        </p>
      </div>
    </div>
  );
}
