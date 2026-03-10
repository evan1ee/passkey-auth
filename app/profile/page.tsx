// app/profile/page.tsx

import LogoutButton from "@/components/LogoutButton";
import { getSession } from "@/lib/session";


export default async function ProfilePage() {
    // Ensure the user has a valid session (middleware enforces auth)
    await getSession();

    return (
        <div className="p-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Profile</h1>
                <LogoutButton />
            </div>
            <hr className="my-4" />
        </div>
    );
}
