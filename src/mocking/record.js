import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { DecoratorHandler } from 'undici'
import { defaultDispatcher } from '../dispatcher.js'
import { getEnabledMockId } from './mocking/index.js'
/** @import { Dispatcher, request as undiciRequest, fetch as undiciFetch } from 'undici' */
/** @import { IncomingHttpHeaders } from 'undici/types/header.d.ts' */
/** @import { MockInterceptor } from 'undici/types/mock-interceptor.d.ts' */
/** @import { FixtureFile, FixtureRecord, SerializedRecord } from './mocking/index.js' */


/** @type {Map<string, Map<string, FixtureRecord[]>>} mock ID: <origin: records> */
const fixtures = new Map()

/** @type {Map<string, string>} key (content-length + method + url): body */
const requestBodies = new Map()

/** Track pending requests so that we don’t record our fixture before capturing all pending requests */
let pendingRequestsCount = 0


/**
 * When mocking is enabled, return the dispatcher that should be used for HTTP requests.
 * @link https://github.com/nock/nock/issues/2397#issuecomment-1924424258
 * @link https://github.com/nodejs/corepack/blob/main/tests/recordRequests.js
 * @param {string} url
 * @param {Parameters<undiciRequest>[1] | Parameters<undiciFetch>[1]} options
 */
export function saveRequestForResultInterceptor(url, options) {
	// Save the request body so that we can match it in the interceptor
	if (options?.body && options.headers) {
		const contentLength = getContentLength(options.headers)
		// Save under a key that’s hopefully unique enough to match this request and not similar ones
		requestBodies.set(`${options.method} ${contentLength} ${url}`, `${options.body}`)
	}
}

class ResultInterceptor extends DecoratorHandler {
	/** @type {string} */
	#mockId
	/** @type {FixtureRecord} */
	#record

	/**
	 * @param {Dispatcher.DispatchHandler} handler
	 * @param {Dispatcher.DispatchOptions} options
	 */
	constructor(handler, options) {
		super(handler)
		const mockId = getEnabledMockId()
		if (!mockId) {
			throw new Error('Mocking is not enabled')
		}

		this.#mockId = mockId

		this.#record = {
			options,
			responseBody: [],
		}

		// For some reason, `options.body` is defined when there’s a body, but it’s an AsyncGenerator that we can’t read from
		if (options.body && options.headers) {
			const requestBodyKey = `${options.method} ${getContentLength(options.headers)} ${options.origin}${options.path}`
			this.#record.requestBody = requestBodies.get(requestBodyKey)
			requestBodies.delete(requestBodyKey)
		}
	}

	/**
	 * Types per `Dispatcher.DispatchHandler.onRequestStart`
	 * @param {Dispatcher.DispatchController} controller
	 * @param {unknown} context
	 */
	onRequestStart(controller, context) {
		pendingRequestsCount++
		super.onRequestStart?.(controller, context)
	}

	/**
	 * Types per `Dispatcher.DispatchHandler.onResponseStart`
	 * @param {Dispatcher.DispatchController} controller
	 * @param {number} statusCode
	 * @param {IncomingHttpHeaders} headers
	 * @param {string} statusMessage
	 */
	onResponseStart(controller, statusCode, headers, statusMessage) {
		Object.assign(this.#record, { statusCode, headers })
		super.onResponseStart?.(controller, statusCode, headers, statusMessage)
	}

	/**
	 * Types per `Dispatcher.DispatchHandler.onResponseData`
	 * @param {Dispatcher.DispatchController} controller
	 * @param {Buffer<ArrayBufferLike>} chunk
	 */
	onResponseData(controller, chunk) {
		this.#record.responseBody.push(chunk)
		super.onResponseData?.(controller, chunk)
	}

	/**
	 * Types per `Dispatcher.DispatchHandler.onResponseEnd`
	 * @param {Dispatcher.DispatchController} controller
	 * @param {IncomingHttpHeaders} trailers
	 */
	onResponseEnd(controller, trailers) {
		pendingRequestsCount--
		Object.assign(this.#record, { trailers })

		if (!fixtures.has(this.#mockId)) {
			fixtures.set(this.#mockId, new Map())
		}

		const fixture = fixtures.get(this.#mockId)
		if (!fixture) { // Type guard
			throw new Error(`Fixture ${this.#mockId} not found`)
		}

		if (!fixture.has(`${this.#record.options.origin}`)) {
			fixture.set(`${this.#record.options.origin}`, /** @type {FixtureRecord[]} */([]))
		}

		const records = fixture.get(`${this.#record.options.origin}`)
		if (!records) { // Type guard
			throw new Error(`Fixture ${this.#mockId} origin ${this.#record.options.origin} not found`)
		}

		records.push(this.#record)

		super.onResponseEnd?.(controller, trailers)
	}

	/**
	 * Types per `Dispatcher.DispatchHandler.onResponseError`
	 * @param {Dispatcher.DispatchController} controller
	 * @param {Error} error
	 */
	onResponseError(controller, error) {
		this.#record.error = error
		super.onResponseError?.(controller, error)
	}
}

/**
 * @param {Dispatcher['dispatch']} dispatch
 */
function requestInterceptor(dispatch) {
	/**
	 * @param {Dispatcher.DispatchOptions} options
	 * @param {Dispatcher.DispatchHandler} handler
	 */
	function InterceptedDispatch(options, handler) {
		return dispatch(options, new ResultInterceptor(handler, options))
	}

	return InterceptedDispatch
}

/**
 * @param {string} mockId
 */
export async function getRecordingDispatcher(mockId) {
	await mkdir(new URL('mocks', import.meta.url), { recursive: true })
	const requests = new Map()
	fixtures.set(mockId, requests)
	return defaultDispatcher.compose(requestInterceptor)
}


const sleep = promisify(setTimeout)
/**
 * @param {string} enabledMockId
 */
export async function saveMocks(enabledMockId) {
	// Wait until all pending requests have been recorded
	let polls = 0
	while (pendingRequestsCount > 0 && polls < 10) { // eslint-disable-line no-unmodified-loop-condition
		polls++
		await sleep(1000)
	}

	const requests = fixtures.get(enabledMockId)
	if (!requests) {
		throw new Error(`Fixture ${enabledMockId} not found`)
	}

	/** @type {Record<string, SerializedRecord[]>} */
	const mocks = {}
	for (const [origin, records] of requests.entries()) {
		mocks[origin] = records.map(record =>
			/** @type {SerializedRecord} */({
				method: record.options.method,
				path: record.options.path,
				requestBody: record.requestBody,
				statusCode: record.statusCode,
				responseHeaders: record.headers,
				responseBody: Buffer.concat(record.responseBody).toString('utf8') || '',
				trailers: record.trailers,
				error: record.error?.message,
			}),
		)
	}

	const mocksData = JSON.stringify(/** @type {FixtureFile} */({
		timestamp: new Date().toISOString(), // Save the timestamp so we can see when the fixture was recorded
		mocks,
	}), undefined, '\t')
	await writeFile(new URL(`mocks/${enabledMockId}.json`, import.meta.url), mocksData, 'utf8')
}


/**
 * @param {Dispatcher.DispatchOptions['headers']} headers
 */
function getContentLength(headers) {
	if (!headers) {
		return 0
	}

	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === 'content-length' && typeof value === 'string') {
			return Number.parseInt(value, 10) // Need to use `Number.parseInt` because the value might be a string like `11921, 11921` and we want this converted to `11921`
		}
	}

	return 0
}
