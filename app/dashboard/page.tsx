"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import {
  checkWebAuthnAvailability,
  registerWebAuthnCredential,
  authenticateWithWebAuthn,
} from "@/lib/webauth";
import {
  saveCredential,
  getAllCredentials,
  updateCredentialCounter,
} from "@/lib/credential-store";
import LogoutButton from "@/components/LogoutButton";
import { getChallenge } from "../actions/auth";
import type { SessionData, StoredCredential } from "@/lib/types";

// ─── Types for API responses ─────────────────────────────────────────

interface RegisterResponse {
  success: boolean;
  error?: string;
  data?: {
    credentialId: string;
    publicKey: number[];
    counter: number;
  };
}

interface LoginResponse {
  success: boolean;
  error?: string;
  data?: {
    verified: boolean;
    newCounter: number;
  };
}

// ─── Dashboard Page ──────────────────────────────────────────────────

export default function DashboardPage() {
  // Session & WebAuthn availability
  const [isAvailable, setIsAvailable] = useState(false);
  const [session, setSession] = useState<SessionData | null>(null);

  // Passkey workflow state
  const [challenge, setChallenge] = useState("");
  const [webauthnCredential, setWebauthnCredential] = useState<object | null>(null);
  const [credentialWithAssertion, setCredentialWithAssertion] = useState<object | null>(null);
  const [storedCredential, setStoredCredential] = useState<StoredCredential | null>(null);

  // API response state (for display in the demo)
  const [registerResponse, setRegisterResponse] = useState<RegisterResponse | null>(null);
  const [authResponse, setAuthResponse] = useState<LoginResponse | null>(null);

  // UI state
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({
    challenge: false,
    createCredential: false,
    verifyCredential: false,
    getCredential: false,
    verifyAuthentication: false,
  });

  // ── Initialization ──────────────────────────────────────────────────

  useEffect(() => {
    // Fetch session
    const fetchSession = async () => {
      try {
        const response = await fetch("/api/session");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setSession(data.session);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to fetch session: ${msg}`);
        toast.error("Failed to load session data");
      }
    };

    // Check WebAuthn support
    const checkAvailability = () => {
      try {
        setIsAvailable(checkWebAuthnAvailability());
      } catch (err) {
        console.error("WebAuthn availability check failed:", err);
      }
    };

    // Load any previously stored credential from localStorage
    const loadStoredCredential = () => {
      const credentials = getAllCredentials();
      if (credentials.length > 0) {
        setStoredCredential(credentials[0]); // Use the most recent
      }
    };

    fetchSession();
    checkAvailability();
    loadStoredCredential();
  }, []);

  // ── Workflow Handlers ───────────────────────────────────────────────

  // Steps 1 & 4: Generate a server-side challenge
  const handleGenerateChallenge = useCallback(async () => {
    setIsLoading((prev) => ({ ...prev, challenge: true }));
    try {
      const data = await getChallenge();
      setChallenge(data);
      setError("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to generate challenge: ${msg}`);
      toast.error("Challenge generation failed");
    } finally {
      setIsLoading((prev) => ({ ...prev, challenge: false }));
    }
  }, []);

  // Step 2: Create credential (browser WebAuthn API)
  const handleCreateCredential = useCallback(async () => {
    if (!challenge) {
      toast.error("Please generate a challenge first");
      return;
    }
    if (!session?.email) {
      toast.error("User session email not available");
      return;
    }

    setIsLoading((prev) => ({ ...prev, createCredential: true }));
    try {
      const credential = await registerWebAuthnCredential(
        challenge,
        session.email,
        session.email
      );
      setWebauthnCredential(credential);
      setError("");
      toast.success("Credential created successfully");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Error creating WebAuthn credential: ${msg}`);
      toast.error("Failed to create credential");
    } finally {
      setIsLoading((prev) => ({ ...prev, createCredential: false }));
    }
  }, [challenge, session?.email]);

  // Step 3: Verify registration (server) & save to localStorage
  const handleVerifyCredential = useCallback(async () => {
    if (!webauthnCredential) {
      toast.error("Credential missing — complete step 2 first");
      return;
    }

    setIsLoading((prev) => ({ ...prev, verifyCredential: true }));
    try {
      // Send only the credential — the server extracts the challenge
      // from clientDataJSON and validates it against its own store
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: webauthnCredential }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || `HTTP ${response.status}`);
      }

      const result: RegisterResponse = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.error || "Verification failed");
      }

      setRegisterResponse(result);

      // Save credential to localStorage for persistence across page reloads
      const newCredential: StoredCredential = {
        credentialId: result.data.credentialId,
        publicKey: result.data.publicKey,
        counter: result.data.counter,
        createdAt: new Date().toISOString(),
      };
      saveCredential(newCredential);
      setStoredCredential(newCredential);

      toast.success("Registration verified — credential saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Error verifying registration: ${msg}`);
      toast.error("Verification failed");
    } finally {
      setIsLoading((prev) => ({ ...prev, verifyCredential: false }));
    }
  }, [webauthnCredential]);

  // Step 5: Get assertion (browser WebAuthn API)
  // Automatically generates a FRESH challenge before calling the authenticator.
  // This is necessary because the registration challenge (step 3) was consumed
  // on the server (single-use), so we need a new one for authentication.
  const handleGetCredential = useCallback(async () => {
    if (!storedCredential) {
      toast.error("No stored credential — register a passkey first");
      return;
    }

    setIsLoading((prev) => ({ ...prev, getCredential: true }));
    try {
      // Step 4 (implicit): generate a fresh challenge for authentication
      const freshChallenge = await getChallenge();
      setChallenge(freshChallenge);

      // Step 5: sign the fresh challenge with the authenticator.
      // Pass the stored credential ID so the browser restricts to this
      // specific passkey (prevents selecting a different one).
      const credential = await authenticateWithWebAuthn(
        freshChallenge,
        storedCredential.credentialId
      );
      setCredentialWithAssertion(credential);
      setError("");
      toast.success("Login credential retrieved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Error getting assertion: ${msg}`);
      toast.error("Failed to get credential");
    } finally {
      setIsLoading((prev) => ({ ...prev, getCredential: false }));
    }
  }, [storedCredential]);

  // Step 6: Verify authentication (server)
  const handleVerifyAuthentication = useCallback(async () => {
    if (!credentialWithAssertion || !storedCredential) {
      toast.error("Missing assertion credential or stored credential");
      return;
    }

    setIsLoading((prev) => ({ ...prev, verifyAuthentication: true }));
    try {
      // Send the assertion and the stored credential (from localStorage).
      // The server extracts the challenge from clientDataJSON.
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assertionCredential: credentialWithAssertion,
          credential: {
            id: storedCredential.credentialId,
            publicKey: storedCredential.publicKey,
            counter: storedCredential.counter,
          },
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || `HTTP ${response.status}`);
      }

      const result: LoginResponse = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.error || "Authentication failed");
      }

      setAuthResponse(result);

      // Update the counter in localStorage
      if (result.data.newCounter != null) {
        updateCredentialCounter(
          storedCredential.credentialId,
          result.data.newCounter
        );
        setStoredCredential((prev) =>
          prev ? { ...prev, counter: result.data!.newCounter } : prev
        );
      }

      // Refresh session to show isPasskeyLoggedIn = true
      const sessionRes = await fetch("/api/session");
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        setSession(sessionData.session);
      }

      toast.success("Authentication successful");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Error verifying authentication: ${msg}`);
      toast.error("Authentication failed");
    } finally {
      setIsLoading((prev) => ({ ...prev, verifyAuthentication: false }));
    }
  }, [credentialWithAssertion, storedCredential]);

  // ── Render Helpers ──────────────────────────────────────────────────

  const renderSessionInfo = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <InfoCard label="User ID" value={session?.userId} />
      <InfoCard label="Email" value={session?.email} />
      <InfoCard
        label="isLoggedIn"
        value={session?.isLoggedIn ? "true" : "false"}
      />
      <InfoCard
        label="isPasskeyLoggedIn"
        value={session?.isPasskeyLoggedIn ? "true" : "false"}
      />
    </div>
  );

  const renderCredentialInfo = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:row-span-2 flex flex-col">
        <div className="p-3 bg-gray-50 rounded-xl flex-1">
          <p className="text-sm font-medium text-gray-500">Public Key</p>
          <p className="bg-gray-50 rounded-xl overflow-y-auto text-sm break-all">
            {storedCredential
              ? `[${storedCredential.publicKey.length} bytes]`
              : "No credential stored"}
          </p>
        </div>
      </div>

      <div className="p-3 bg-gray-50 rounded-xl flex-1">
        <p className="text-sm font-medium text-gray-500">Credential ID</p>
        <p className="text-gray-800 break-all">
          {storedCredential?.credentialId || "—"}
        </p>
      </div>

      <div className="p-3 bg-gray-50 rounded-xl flex-1">
        <p className="text-sm font-medium text-gray-500">Counter</p>
        <p className="text-gray-800 break-all">
          {storedCredential?.counter ?? "—"}
          <span className="text-[0.8rem] italic text-gray-500">
            {" "}
            (stored in localStorage)
          </span>
        </p>
      </div>
    </div>
  );

  const renderWorkflowButtons = () => (
    <div className="flex flex-col gap-3 mb-8">
      {/* ── Registration Phase ── */}
      <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Registration</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <WorkflowButton
          onClick={handleGenerateChallenge}
          label="1. Generate Challenge"
          isLoading={isLoading.challenge}
        />
        <WorkflowButton
          onClick={handleCreateCredential}
          label="2. Create Credential"
          isLoading={isLoading.createCredential}
          disabled={!challenge}
        />
        <WorkflowButton
          onClick={handleVerifyCredential}
          label="3. Verify Registration"
          isLoading={isLoading.verifyCredential}
          disabled={!webauthnCredential}
        />
      </div>

      {/* ── Authentication Phase ── */}
      <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mt-4">Authentication</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <WorkflowButton
          onClick={handleGetCredential}
          label="4 & 5. Challenge + Get Assertion"
          isLoading={isLoading.getCredential}
          disabled={!storedCredential}
        />
        <WorkflowButton
          onClick={handleVerifyAuthentication}
          label="6. Verify Authentication"
          isLoading={isLoading.verifyAuthentication}
          disabled={!credentialWithAssertion || !storedCredential}
        />
      </div>
    </div>
  );

  const renderResponses = () => (
    <div className="space-y-4">
      <ResponseCard
        title="Passkey Available"
        content={
          <p className={isAvailable ? "text-green-600" : "text-red-600"}>
            {isAvailable ? "Available" : "Unavailable"}
          </p>
        }
      />

      <ResponseCard
        title="Challenge"
        content={
          challenge ? (
            <p className="bg-gray-50 rounded-xl overflow-x-auto text-sm">
              {challenge}
            </p>
          ) : (
            <p className="text-gray-500 text-sm">No challenge created yet</p>
          )
        }
      />

      <ResponseCard
        title="Credential With Attestation (Registration)"
        content={
          webauthnCredential ? (
            <pre className="bg-gray-50 rounded-xl overflow-x-auto text-sm">
              {JSON.stringify(webauthnCredential, null, 2)}
            </pre>
          ) : (
            <p className="text-gray-500 text-sm">No credentials created yet</p>
          )
        }
      />

      <ResponseCard
        title="Registration Verification Response"
        content={
          registerResponse ? (
            <pre className="bg-gray-50 rounded-xl overflow-x-auto text-sm max-h-96">
              {JSON.stringify(registerResponse, null, 2)}
            </pre>
          ) : (
            <p className="text-gray-500 text-sm">
              No verification response yet
            </p>
          )
        }
      />

      <ResponseCard
        title="Credential With Assertion (Login)"
        content={
          credentialWithAssertion ? (
            <pre className="bg-gray-50 rounded-xl overflow-x-auto text-sm">
              {JSON.stringify(credentialWithAssertion, null, 2)}
            </pre>
          ) : (
            <p className="text-gray-500 text-sm">
              No credentials with assertion yet
            </p>
          )
        }
      />

      <ResponseCard
        title="Authentication Verification Response"
        content={
          authResponse ? (
            <pre className="bg-gray-50 rounded-xl overflow-x-auto text-sm max-h-96">
              {JSON.stringify(authResponse, null, 2)}
            </pre>
          ) : (
            <p className="text-gray-500 text-sm">
              No verification response yet
            </p>
          )
        }
      />
    </div>
  );

  // ── Main Render ─────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl md:text-3xl font-semibold text-gray-800">
          Dashboard
        </h2>
        <LogoutButton />
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 md:p-8 border border-gray-100">
        <Section title="User Session">{renderSessionInfo()}</Section>

        <Divider />

        <Section title="Passkey Workflow">
          {renderWorkflowButtons()}
          {error && (
            <div className="bg-red-50 p-4 rounded-xl flex items-center">
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}
        </Section>

        <Divider />

        <Section title="Stored Credential (localStorage)">
          {renderCredentialInfo()}
        </Section>

        <Divider />

        <Section title="API Responses">{renderResponses()}</Section>
      </div>
    </div>
  );
}

// ─── Reusable UI Components ──────────────────────────────────────────

type SectionProps = {
  title: string;
  children: React.ReactNode;
};

const Section = ({ title, children }: SectionProps) => (
  <>
    <h3 className="text-xl font-semibold text-gray-800 mb-5">{title}</h3>
    {children}
  </>
);

const Divider = () => <div className="my-8 border-t border-gray-200" />;

type InfoCardProps = {
  label: string;
  value: string | undefined;
};

const InfoCard = ({ label, value }: InfoCardProps) => (
  <div className="p-3 bg-gray-50 rounded-xl">
    <p className="text-sm font-medium text-gray-500">{label}</p>
    <p className="text-gray-800 truncate overflow-y-auto">{value || "—"}</p>
  </div>
);

type WorkflowButtonProps = {
  onClick: () => Promise<void>;
  label: string;
  isLoading: boolean;
  disabled?: boolean;
};

const WorkflowButton = ({
  onClick,
  label,
  isLoading,
  disabled = false,
}: WorkflowButtonProps) => (
  <button
    onClick={onClick}
    disabled={disabled || isLoading}
    className={`flex-1 py-3 px-6 bg-white border border-blue-500 rounded-xl text-blue-500 hover:bg-blue-50 transition-colors duration-200 relative ${
      disabled ? "opacity-50 cursor-not-allowed" : ""
    }`}
  >
    <span className="block text-sm font-semibold">
      {isLoading ? "Processing..." : label}
    </span>
  </button>
);

type ResponseCardProps = {
  title: string;
  content: React.ReactNode;
};

const ResponseCard = ({ title, content }: ResponseCardProps) => (
  <div className="bg-gray-50 rounded-xl p-2">
    <div className="bg-gray-50 rounded-xl p-2 overflow-x-auto text-sm">
      <h4 className="text-base font-semibold text-gray-500 mb-2">{title}</h4>
      {content}
    </div>
  </div>
);
