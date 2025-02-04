from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
import os
import time
import logging

class YouTubeAuth:
    def __init__(self):
        self.cookie_file = 'cookies.txt'
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)
        
    def login(self, email, password):
        options = webdriver.ChromeOptions()
        # Remove headless mode temporarily for debugging
        # options.add_argument('--headless')
        options.add_argument('--window-size=1920,1080')
        options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')
        driver = webdriver.Chrome(options=options)
        
        try:
            # Login to Google
            self.logger.info("Navigating to Google login page")
            driver.get('https://accounts.google.com')
            
            # Handle email
            self.logger.info("Entering email")
            email_input = WebDriverWait(driver, 20).until(
                EC.element_to_be_clickable((By.NAME, "identifier"))
            )
            email_input.clear()
            email_input.send_keys(email)
            
            next_button = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.ID, "identifierNext"))
            )
            next_button.click()
            time.sleep(2)  # Wait for transition
            
            # Handle password
            self.logger.info("Entering password")
            password_input = WebDriverWait(driver, 20).until(
                EC.element_to_be_clickable((By.NAME, "password"))
            )
            password_input.clear()
            password_input.send_keys(password)
            
            pass_next = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.ID, "passwordNext"))
            )
            pass_next.click()
            time.sleep(5)  # Wait for login to complete
            
            # Check for 2FA prompt
            try:
                self.logger.info("Checking for 2FA prompt")
                WebDriverWait(driver, 5).until(
                    EC.presence_of_element_located((By.ID, "totpPin"))
                )
                self.logger.warning("2FA detected - manual intervention required")
                input("Please complete 2FA verification and press Enter to continue...")
            except TimeoutException:
                self.logger.info("No 2FA prompt detected")
            
            # Go to YouTube and get cookies
            self.logger.info("Navigating to YouTube")
            driver.get('https://www.youtube.com')
            time.sleep(5)  # Wait for YouTube to load completely
            
            # Verify login success
            if not any(cookie['domain'] == '.youtube.com' for cookie in driver.get_cookies()):
                raise Exception("YouTube cookies not found - login may have failed")
            
            # Save cookies
            self.logger.info("Saving cookies")
            cookies = driver.get_cookies()
            
            with open(self.cookie_file, 'w') as f:
                for cookie in cookies:
                    expiry = cookie.get('expiry', '')
                    secure = 'TRUE' if cookie.get('secure', False) else 'FALSE'
                    http_only = 'TRUE' if cookie.get('httpOnly', False) else 'FALSE'
                    
                    f.write(f".{cookie['domain'].lstrip('.')}\t"  # Remove leading dot if present
                           f"TRUE\t"  # Include subdomain
                           f"{cookie['path']}\t"
                           f"{secure}\t"  # Secure flag
                           f"{expiry}\t"  # Expiry timestamp
                           f"{cookie['name']}\t"
                           f"{cookie['value']}\n")
            
            self.logger.info("Login successful")
            return True
            
        except Exception as e:
            self.logger.error(f"Login failed: {str(e)}")
            return False
        finally:
            driver.quit()

    def get_credentials(self):
        """Get credentials from environment variables"""
        email = os.getenv('YOUTUBE_EMAIL')
        password = os.getenv('YOUTUBE_PASSWORD')
        if not email or not password:
            raise ValueError("YouTube credentials not found in environment variables")
        return email, password

    def ensure_auth(self):
        """Ensure authentication is valid"""
        if not os.path.exists(self.cookie_file):
            email, password = self.get_credentials()
            if not self.login(email, password):
                raise Exception("Failed to authenticate with YouTube")
            