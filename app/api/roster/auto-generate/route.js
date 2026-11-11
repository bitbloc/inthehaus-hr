import { NextResponse } from 'next/server';
import { autoGenerateWeeklyRoster, learnEmployeePatterns, syncLearnedToTemplates } from '../../../../utils/roster_auto_learner';

export async function POST(request) {
    try {
        const body = await request.json().catch(() => ({}));
        const { action = 'GENERATE', startDate, endDate, overwrite = true, applyLeaves = true, syncTemplate = false, weeksBack = 8 } = body;

        if (action === 'LEARN') {
            const result = await learnEmployeePatterns({ weeksBack });
            if (syncTemplate) {
                await syncLearnedToTemplates(result.learnedHabits);
            }
            return NextResponse.json({
                success: true,
                employees: result.employees,
                learnedHabits: result.learnedHabits,
                weeksAnalyzed: result.weeksAnalyzed,
                totalHistoricalTxs: result.totalHistoricalTxs,
                syncedToTemplates: !!syncTemplate
            });
        }

        if (action === 'GENERATE') {
            const result = await autoGenerateWeeklyRoster({
                startDate,
                endDate,
                overwrite,
                applyLeaves,
                syncTemplate
            });

            return NextResponse.json(result);
        }

        return NextResponse.json({ success: false, message: 'Invalid action parameter' }, { status: 400 });

    } catch (error) {
        console.error('Roster Auto-Generate API Error:', error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}

export async function GET(request) {
    try {
        const result = await learnEmployeePatterns({ weeksBack: 8 });
        return NextResponse.json({
            success: true,
            employees: result.employees,
            learnedHabits: result.learnedHabits,
            weeksAnalyzed: result.weeksAnalyzed
        });
    } catch (error) {
        console.error('Roster Auto-Generate GET Error:', error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}

