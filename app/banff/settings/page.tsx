import Link from 'next/link';
import HabitForm from '../components/HabitForm';

export default function BanffSettingsPage() {
    return (
        <div className="p-6 space-y-6">
            <header className="flex items-center gap-4">
                <Link href="/banff" className="p-2 -ml-2 text-zinc-400 hover:text-white">
                    ← Back
                </Link>
                <h1 className="text-xl font-bold">Settings</h1>
            </header>

            <section>
                <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Manage Habits</h2>
                {/* HabitForm will go here */}
                <HabitForm />
            </section>

            <section>
                <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Lifestyles</h2>
                <div className="p-6 border border-dashed border-zinc-800 rounded-xl text-center text-zinc-600">
                    Lifestyle Manager Component
                </div>
            </section>
        </div>
    );
}
