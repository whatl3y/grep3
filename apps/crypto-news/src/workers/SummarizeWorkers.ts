import { IFactoryOptions } from "@grep3/core";
import { generateDailySummary } from "../services/SummaryService";
import { getTodayUTC } from "../libs/dateUtils";

export default function SummarizeWorkers({ log, db, redis }: IFactoryOptions) {
  return {
    // Generate or regenerate summary for a specific date
    generateDailySummary: {
      plugins: ["Retry"],
      pluginOptions: {
        retry: {
          retryLimit: 2,
          retryDelay: 1000 * 60, // 1 minute
        },
      },
      perform: async ({ date }: { date?: string }) => {
        const targetDate = date || getTodayUTC();
        log.info(`Starting generateDailySummary job for ${targetDate}`);

        try {
          const result = await generateDailySummary(targetDate);

          if (result.success) {
            log.info(
              `Successfully generated summary for ${targetDate}: ${result.eventCount} events`
            );
          } else {
            log.info(`No summary generated for ${targetDate} (no items)`);
          }

          return {
            success: result.success,
            date: targetDate,
            eventCount: result.eventCount,
            tokensUsed: result.tokensUsed,
          };
        } catch (err: any) {
          log.error(`Failed to generate summary for ${targetDate}`, err);
          throw err;
        }
      },
    },

    // Generate summary for today (convenience job for scheduler)
    generateTodaySummary: {
      perform: async () => {
        const today = getTodayUTC();
        log.info(`Starting generateTodaySummary job for ${today}`);

        const result = await generateDailySummary(today);

        return {
          success: result.success,
          date: today,
          eventCount: result.eventCount,
          tokensUsed: result.tokensUsed,
        };
      },
    },
  };
}
