package com.eurodon.kiosk

import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import com.eurodon.kiosk.databinding.ActivityMainBinding
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings
import org.mozilla.geckoview.GeckoSession

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var runtime: GeckoRuntime
    private lateinit var session: GeckoSession
    private var canNavigateBack: Boolean = false

    private val kioskUrl: String
        get() = intent?.getStringExtra(EXTRA_URL)?.takeIf { it.isNotBlank() }
            ?: getString(R.string.kiosk_url)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        hideSystemUi()
        configureGeckoView()
        loadKiosk()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    override fun onResume() {
        super.onResume()
        hideSystemUi()
    }

    override fun onBackPressed() {
        if (::session.isInitialized && canNavigateBack) {
            session.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        if (::session.isInitialized) {
            session.close()
        }
        super.onDestroy()
    }

    private fun hideSystemUi() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
            )
    }

    private fun configureGeckoView() {
        runtime = GeckoRuntime.create(
            this,
            GeckoRuntimeSettings.Builder()
                .javaScriptEnabled(true)
                .aboutConfigEnabled(false)
                .build(),
        )
        session = GeckoSession().apply {
            open(runtime)
            navigationDelegate = object : GeckoSession.NavigationDelegate {
                override fun onCanGoBack(session: GeckoSession, canGoBack: Boolean) {
                    canNavigateBack = canGoBack
                }
            }
            progressDelegate = object : GeckoSession.ProgressDelegate {
                override fun onPageStart(session: GeckoSession, url: String) {
                    binding.progress.visibility = View.VISIBLE
                    binding.errorText.visibility = View.GONE
                }

                override fun onPageStop(session: GeckoSession, success: Boolean) {
                    binding.progress.visibility = View.GONE
                    if (!success) {
                        showError("Не удалось открыть адрес:\n$kioskUrl\n\nПроверьте сеть и доступность сервера.")
                    }
                }
            }
        }
        binding.webView.setSession(session)
    }

    private fun loadKiosk() {
        binding.progress.visibility = View.VISIBLE
        binding.errorText.visibility = View.GONE
        session.loadUri(kioskUrl)
    }

    private fun showError(message: String) {
        binding.progress.visibility = View.GONE
        binding.errorText.text = message
        binding.errorText.visibility = View.VISIBLE
    }

    companion object {
        const val EXTRA_URL = "extra_url"
    }
}
