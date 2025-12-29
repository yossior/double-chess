export default function RegisterForm() {
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        // Handle registration logic here
        console.log("Registering with", { username, email, password });
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-80 mx-auto mt-10">
            <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="border p-2 rounded"
            />
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
                disabled={isSubmitting || username === "" || email === "" || password === ""}
                className={`bg-green-600 text-white rounded p-2 mt-2  ${isSubmitting || username === "" || email === "" || password === "" ? "opacity-50 pointer-events-none" : ""}`}
            >
                Register
            </button>
        </form>
    );
}