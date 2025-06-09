import { readFile } from 'node:fs/promises'
import { MockAgent } from 'undici'
/** @import { MockInterceptor } from 'undici/types/mock-interceptor.d.ts' */
/** @import { FixtureFile, SerializedRecord } from './index.js' */


/** @type {Map<string, Map<string, SerializedRecord[]>>} mock ID: <origin: records> */
const fixtures = new Map()
/** @type {string | undefined} */
let fixturesTimestamp


/**
 * @param {string} enabledMockId
 */
export async function getPlaybackDispatcher(enabledMockId) {
	if (!fixtures.has(enabledMockId)) { // Playback mode
		const mocksData = await readFile(new URL(`mocks/${enabledMockId}.json`, import.meta.url), 'utf8')
		const { timestamp, mocks } = /** @type {FixtureFile} */(JSON.parse(mocksData))
		fixturesTimestamp = timestamp
		const requests = new Map(Object.entries(mocks))
		fixtures.set(enabledMockId, requests)
	}

	const requests = fixtures.get(enabledMockId)
	if (!requests) {
		throw new Error(`Fixture not found: ${enabledMockId}`)
	}

	const playbackAgent = new MockAgent()
	playbackAgent.disableNetConnect()

	for (const [origin, records] of requests) {
		for (const record of records) {
		/** @type {MockInterceptor.Options} */
			const interceptionMatch = {
				method: record.method,
				path: record.path,
			}

			if (record.requestBody && record.requestBody.length > 0) {
				const { length } = record.requestBody
				interceptionMatch.body = body => body.length === length
			}

			playbackAgent.get(origin)
				.intercept(interceptionMatch)
				.reply(record.statusCode || 200, record.responseBody, {
					headers: record.responseHeaders,
					trailers: record.trailers,
				})
		}
	}

	return playbackAgent
}

export function getFixturesTimestamp() {
	return fixturesTimestamp ? new Date(fixturesTimestamp) : undefined
}

export function resetMocks() {
	fixtures.clear()
	fixturesTimestamp = undefined
}
