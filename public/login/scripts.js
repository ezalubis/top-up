const switchers = [...document.querySelectorAll('.switcher')]

switchers.forEach(item => {
	item.addEventListener('click', function() {
		switchers.forEach(item => item.parentElement.classList.remove('is-active'))
		this.parentElement.classList.add('is-active')
	})
})
document.login.onsubmit = async(e) => {
    e.preventDefault();
    const response = await fetch("/api/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            email: document.login.email.value,
            password: document.login.password.value,
        }),
    });
    if (response.ok) {
        const token = await response.text();
        localStorage.setItem("token", token);
        location.href = "/user";
    } else {
        const message = await response.text();
        alert(message);
    }
};
