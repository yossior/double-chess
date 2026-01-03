import { useState } from "react";

export default function LoginForm() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        // Handle login logic here
        console.log("Logging in with", { email, password });
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-80 mx-auto mt-10">
            <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border p-2 rounded"
            />
            <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border p-2 rounded"
            />
            {error && <p className="text-red-500">{error}</p>}
            <button
                type="submit"
                disabled={isSubmitting || email === "" || password === ""}
                className={`bg-blue-600 text-white rounded p-2 mt-2  ${isSubmitting || email === "" || password === "" ? "opacity-50 pointer-events-none" : ""}`}
            >
                Login

            </button>
        </form>
    );
}