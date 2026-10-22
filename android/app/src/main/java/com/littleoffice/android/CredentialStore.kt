package com.littleoffice.android

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

/** The bearer and pending PKCE verifier are encrypted with a non-exportable device key. */
class CredentialStore(context: Context) {
    private val preferences = context.getSharedPreferences("credentials", Context.MODE_PRIVATE)
    private val alias = "little-office-session"

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return (store.getKey(alias, null) as? SecretKey)
            ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
                .apply {
                    init(
                        KeyGenParameterSpec.Builder(
                                alias,
                                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                            )
                            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                            .build()
                    )
                }
                .generateKey()
    }

    fun save(name: String, value: JSONObject?) {
        if (value == null) {
            preferences.edit().remove(name).apply()
            return
        }
        val cipher =
            Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(Cipher.ENCRYPT_MODE, key())
                updateAAD(name.toByteArray())
            }
        val encrypted = cipher.iv + cipher.doFinal(value.toString().toByteArray())
        preferences.edit().putString(name, Base64.encodeToString(encrypted, Base64.NO_WRAP)).apply()
    }

    fun read(name: String): JSONObject? {
        val value = preferences.getString(name, null) ?: return null
        return runCatching {
            val bytes = Base64.decode(value, Base64.NO_WRAP)
            val cipher =
                Cipher.getInstance("AES/GCM/NoPadding").apply {
                    init(
                        Cipher.DECRYPT_MODE,
                        key(),
                        GCMParameterSpec(128, bytes.copyOfRange(0, 12)),
                    )
                    updateAAD(name.toByteArray())
                }
            JSONObject(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8))
        }
            .getOrElse {
                preferences.edit().remove(name).apply()
                null
            }
    }
}
