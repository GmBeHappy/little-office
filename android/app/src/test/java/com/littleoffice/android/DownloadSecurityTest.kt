package com.littleoffice.android

import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import kotlinx.coroutines.runBlocking
import okhttp3.*
import okio.Buffer
import org.junit.Assert.*
import org.junit.Test

class DownloadSecurityTest {
    @Test
    fun snapshotFetchStripsCredentialsAndBoundsUnknownLengthBodies() = runBlocking {
        val requests = mutableListOf<Request>()
        var length = 4
        val client =
            OkHttpClient.Builder()
                .followRedirects(false)
                .addInterceptor { chain ->
                    val request = chain.request()
                    requests += request
                    val office = request.url.host == "office.example.test"
                    val response =
                        Response.Builder()
                            .request(request)
                            .protocol(Protocol.HTTP_1_1)
                            .message("test")
                            .code(if (office) 302 else 200)
                    if (office)
                        response.header(
                            "Location",
                            "https://storage.example.test/snapshot.png?signature=temporary",
                        )
                    response
                        .body(
                            object : ResponseBody() {
                                override fun contentType(): MediaType? = null

                                override fun contentLength() =
                                    -1L // Chunked responses must also obey the limit.

                                override fun source() =
                                    Buffer().write(ByteArray(if (office) 0 else length) { 7 })
                            }
                        )
                        .build()
                }
                .build()
        val api =
            OfficeAPI("https://office.example.test", json("token" to "test-only-token"), client)
        try {
            assertArrayEquals(
                ByteArray(4) { 7 },
                api.snapshotBytes("test", "11111111-1111-1111-1111-111111111111"),
            )
            assertEquals("Bearer test-only-token", requests[0].header("Authorization"))
            assertNull(requests[1].header("Authorization"))
            assertNull(requests[1].header("Origin"))
            assertNull(requests[1].header("Cookie"))
            length = 5_000_001
            assertTrue(
                runCatching { api.snapshotBytes("test", "11111111-1111-1111-1111-111111111111") }
                    .exceptionOrNull()
                    ?.message
                    ?.contains("5 MB") == true
            )
            assertEquals(4, requests.size)
        } finally {
            api.close()
        }
    }

    @Test
    fun storageRedirectUsesBearerOnlyAtOfficeAndRejectsUnsafeDestinations() = runBlocking {
        val server = HttpServer.create(InetSocketAddress("localhost", 0), 0)
        var authorization: String? = null
        var hits = 0
        var redirect = "https://storage.example.test/snapshot.png?X-Amz-Signature=temporary"
        server.createContext(
            "/api/workspaces/test/whiteboard/files/11111111-1111-1111-1111-111111111111"
        ) { exchange ->
            hits++
            authorization = exchange.requestHeaders.getFirst("Authorization")
            exchange.responseHeaders.set("Location", redirect)
            exchange.sendResponseHeaders(302, -1)
            exchange.close()
        }
        server.start()
        val api =
            OfficeAPI("http://localhost:${server.address.port}", json("token" to "test-only-token"))
        try {
            assertEquals(
                redirect,
                api.storageDownload("test", "11111111-1111-1111-1111-111111111111"),
            )
            assertEquals("Bearer test-only-token", authorization)
            assertEquals(1, hits) // No automatic redirect or request to storage.
            for (unsafe in
                listOf(
                    "http://storage.example.test/file",
                    "https://user:password@storage.example.test/file",
                )) {
                redirect = unsafe
                assertTrue(
                    runCatching {
                        api.storageDownload("test", "11111111-1111-1111-1111-111111111111")
                    }
                        .isFailure
                )
            }
            assertTrue(runCatching { api.storageDownload("test", "../other-workspace") }.isFailure)
            assertEquals(3, hits)
        } finally {
            api.close()
            server.stop(0)
        }
    }
}
