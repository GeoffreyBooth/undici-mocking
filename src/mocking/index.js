import { getRecordingDispatcher, saveMocks, saveRequestForResultInterceptor } from './record.js'
import { getPlaybackDispatcher, resetMocks } from './play.js'
/** @import { Dispatcher, request as undiciRequest, fetch as undiciFetch } from 'undici' */


/** @type {string | undefined} If mocking is enabled, which set of fixtures is loaded (or being created/updated) */
let enabledMockId

/** @type {boolean} Whether we are updating the mocks */
let updating = false

/** @type {Dispatcher | undefined} */
let mockDispatcher


export function isMockingEnabled() {
	return Boolean(enabledMockId)
}

export function getEnabledMockId() {
	return enabledMockId
}


/**
 * Start the mocking service; playing back previously recorded upstream calls, or creating/updating the fixture if it already exists.
 * @param {string} mockId The filename of the fixture under `./mocks` to load (or update)
 * @param {boolean} update Whether to create or update the fixture if it already exists
 */
export async function enableMocking(mockId, update = false) {
	if (enabledMockId) {
		await disableMocking()
	}

	enabledMockId = mockId
	updating = update

	mockDispatcher = updating ? await getRecordingDispatcher(enabledMockId) : await getPlaybackDispatcher(enabledMockId)

	const message = `Mocking service started for ${mockId}${update ? ' (updating)' : ''}`
	console.log(`${update ? '⏺' : '⏵'} ${message}`)
	return message
}

/**
 * Stop the mocking service; saving the fixture if it was being updated.
 */
export async function disableMocking() {
	if (!enabledMockId) {
		throw new Error('Mocking service is not enabled')
	}

	if (updating) {
		await saveMocks(enabledMockId)
	} else {
		resetMocks()
	}

	const message = `Mocking service stopped for ${enabledMockId}${updating ? ' (fixture updated)' : ''}`
	console.log(`⏹ ${message}`)

	updating = false
	enabledMockId = undefined
	mockDispatcher = undefined

	return message
}

/**
 * When mocking is enabled, return the dispatcher that should be used for HTTP requests.
 * @link https://github.com/nock/nock/issues/2397#issuecomment-1924424258
 * @link https://github.com/nodejs/corepack/blob/main/tests/recordRequests.js
 * @param {string} url
 * @param {Parameters<undiciRequest>[1] | Parameters<undiciFetch>[1]} options
 */
export function getMockDispatcher(url, options) {
	if (!mockDispatcher) {
		throw new Error('Mocking service is not enabled')
	}

	// Save the request body so that we can match it in the interceptor
	if (updating) {
		saveRequestForResultInterceptor(url, options)
	}

	return mockDispatcher
}


/**
 * @typedef {object} FixtureRecord
 * @property {Dispatcher.DispatchOptions} options
 * @property {string} [requestBody]
 * @property {Buffer<ArrayBufferLike>[]} responseBody
 * @property {number} [statusCode]
 * @property {Record<string, string>} [headers]
 * @property {Record<string, string>} [trailers]
 * @property {Error} [error]
 */

/**
 * @typedef {object} SerializedRecord
 * @property {string} path
 * @property {string} method
 * @property {string} [requestBody]
 * @property {number} [statusCode]
 * @property {Record<string, string>} responseHeaders
 * @property {string} responseBody
 * @property {Record<string, string>} [trailers]
 * @property {string} [error]
 */

/**
 * @typedef {object} FixtureFile
 * @property {string} timestamp
 * @property {Record<string, SerializedRecord[]>} mocks
 */
