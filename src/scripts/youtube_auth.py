from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import pickle
import os
import json

class YouTubeAuth:
    def __init__(self):
        self.cookie_file = 'cookies.txt'
        
    def login(self, email, password):
        options = webdriver.ChromeOptions()
        options.add_argument('--headless')
        driver = webdriver.Chrome(options=options)
        
        try:
            # Login to Google
            driver.get('https://accounts.google.com')
            
            # Handle email
            email_input = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.NAME, "identifier"))
            )
            email_input.send_keys(email)
            driver.find_element(By.ID, "identifierNext").click()
            
            # Handle password
            password_input = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.NAME, "password"))
            )
            password_input.send_keys(password)
            driver.find_element(By.ID, "passwordNext").click()
            
            # Go to YouTube and get cookies
            driver.get('https://www.youtube.com')
            cookies = driver.get_cookies()
            
            # Save cookies in Netscape format for yt-dlp
            with open(self.cookie_file, 'w') as f:
                for cookie in cookies:
                    f.write(f"{cookie['domain']}\tTRUE\t{cookie['path']}\t"
                           f"{'FALSE' if cookie['expiry'] else 'TRUE'}\t{cookie['expiry']}\t"
                           f"{cookie['name']}\t{cookie['value']}\n")
            
            return True
            
        except Exception as e:
            print(f"Login failed: {str(e)}")
            return False
        finally:
            driver.quit()